import ast
import json
import re
import sys

from ast_parser import Analyzer, serialize_file_data
from nplusone.analyzer import NPlusOneAnalyzer
from nplusone.scorer import QUERY_METHODS, NPlusOneScorer
from log import LOGGER
from constants import (
	ALLOWED_HOSTS,
    CSRF_COOKIE_SECURE,
    DEBUG, DJANGO_COMPONENTS,
    DJANGO_IGNORE_FUNCTIONS,
    SECRET_KEY,
    SESSION_COOKIE,
    IssueDocLinks,
    IssueSeverity
)

class DjangoAnalyzer(Analyzer):
    def __init__(self, source_code):
        super().__init__(source_code)
        self.current_django_class_type = None
        self.nplusone_analyzer = NPlusOneAnalyzer(source_code)
        self.nplusone_issues = []

    def visit_ClassDef(self, node):
        self.in_class = True
        django_class_type = self._get_django_class_type(node.bases)

        if django_class_type:
            comments = self.get_related_comments(node)
            self.symbols.append(self._create_symbol_dict(
                type=django_class_type,
                name=node.name,
                comments=comments,
                line=node.lineno,
                col_offset=node.col_offset,
                end_col_offset=node.col_offset + len(node.name),
                is_reserved=False
            ))
            self.current_django_class_type = django_class_type
        else:
            self.current_django_class_type = None

        self.generic_visit(node)
        self.in_class = False
        self.current_django_class_type = None

    def visit_FunctionDef(self, node):
        comments = self.get_related_comments(node)
        is_reserved = DJANGO_IGNORE_FUNCTIONS.get(node.name, False) or self.is_python_reserved(node.name)
        function_start_line = node.lineno
        function_start_col = node.col_offset
        
        function_end_line = node.body[-1].end_lineno if hasattr(node.body[-1], 'end_lineno') else node.body[-1].lineno
        function_end_col = node.body[-1].end_col_offset if hasattr(node.body[-1], 'end_col_offset') else len(self.source_code.splitlines()[function_end_line - 1])
        
        if not node.body:
            function_end_line = function_start_line
            function_end_col = function_start_col + len('def ' + node.name + '():')
        body_with_lines, body = self.get_function_body(node)
        decorators = [ast.get_source_segment(self.source_code, decorator) for decorator in node.decorator_list]
        calls = []
        arguments = self.extract_arguments(node.args)
        
        self.visit_FunctionBody(node.body, calls)

        if self.in_class and self.current_django_class_type:
            symbol_type = f'{self.current_django_class_type}_method'
        else:
            symbol_type = 'function'

        contains_query_method = any(self.contains_query_method(call) for call in node.body)
        contains_loop = any(isinstance(child, (ast.For, ast.While)) for child in node.body)
        high_priority = contains_query_method and contains_loop

        self.symbols.append(self._create_symbol_dict(
            type=symbol_type,
            name=node.name,
            comments=comments,
            line=function_start_line,
            col_offset=function_start_col,
            end_col_offset=function_end_col,
            is_reserved=is_reserved,
            body=body,
            body_with_lines=body_with_lines,
            function_start_line=function_start_line,
            function_end_line=function_end_line,
            function_start_col=function_start_col,
            function_end_col=function_end_col,
            decorators=decorators,
            calls=calls,
            arguments=arguments,
            high_priority=high_priority
        ))

        self.generic_visit(node)
        self.nplusone_analyzer.analyze_function(node)
        issues = self.nplusone_analyzer.get_issues()
        self.nplusone_issues.extend(issues)

    def visit_Assign(self, node):
        for target in node.targets:
            if isinstance(target, ast.Name):
                value_source = ast.get_source_segment(self.source_code, node.value)
                comments = self.get_related_comments(node)
                
                if self.in_class and self.current_django_class_type:
                    symbol_type = f'{self.current_django_class_type}_field'
                else:
                    symbol_type = 'assignment'
                
                self.symbols.append(self._create_symbol_dict(
                    type=symbol_type,
                    name=target.id,
                    comments=comments,
                    line=node.lineno,
                    col_offset=target.col_offset,
                    end_col_offset=target.col_offset + len(target.id),
                    is_reserved=False,
                    value=value_source
                ))
        
        self.generic_visit(node)

    def check_assignment_security(self, name: str, value: ast.expr, line: int):
        LOGGER.debug(f'Checking assignment security for {name}')
        value_str = ast.get_source_segment(self.source_code, value)
        if name == DEBUG:
            self.check_debug_setting(value_str, line)
        elif name == SECRET_KEY:
            self.check_secret_key(value_str, line)
        elif name == ALLOWED_HOSTS:
            self.check_allowed_hosts(value_str, line)
        elif name == CSRF_COOKIE_SECURE:
            self.check_csrf_cookie(value_str, line)
        elif name == SESSION_COOKIE:
            self.check_session_cookie(value_str, line)

    def check_debug_setting(self, value: str, line: int):
        if value.strip().lower() == 'true':
            LOGGER.debug('DEBUG is set to True')
            self.add_security_issue(
                'debug_true',
                line,
                f'DEBUG is set to True. Ensure it is False in production.\n\n{IssueDocLinks.DEBUG}\n',
                IssueSeverity.WARNING,
                IssueDocLinks.DEBUG
            )

    def check_secret_key(self, value: str, line: int):
        env_var_patterns = re.compile(
            r'os\.environ\.get\(|env\(|config\(|os\.getenv\('
        )

        if not env_var_patterns.search(value.strip()):
            self.add_security_issue(
                'hardcoded_secret_key',
                line,
                f'SECRET_KEY appears to be hardcoded. It is strongly recommended to store it in an environment variable for better security.\n\n{IssueDocLinks.SECRET_KEY}\n',
                IssueSeverity.WARNING,
                IssueDocLinks.SECRET_KEY
            )

    def check_allowed_hosts(self, value: str, line: int):
        if value == '[]':
            LOGGER.debug('ALLOWED_HOSTS is empty')
            self.add_security_issue(
                'empty_allowed_hosts',
                line,
                f'ALLOWED_HOSTS is empty. This is not secure for production.\n\n{IssueDocLinks.ALLOWED_HOSTS}\n',
                IssueSeverity.WARNING,
                IssueDocLinks.ALLOWED_HOSTS
            )
        elif "'*'" in value or '"*"' in value:
            LOGGER.debug('Wildcard "*" found in ALLOWED_HOST')
            self.add_security_issue(
                'wildcard_allowed_hosts',
                line,
                f'ALLOWED_HOSTS contains a wildcard "*". This is not recommended for production.\n\n{IssueDocLinks.ALLOWED_HOSTS}\n',
                IssueSeverity.WARNING,
                IssueDocLinks.ALLOWED_HOSTS
            )

    def check_csrf_cookie(self, value: str, line: int):
        if value == 'False':
            LOGGER.debug('CSRF_COOKIE_SECURE is set to False')
            self.add_security_issue(
                'csrf_cookie_secure_false',
                line,
                f'CSRF_COOKIE_SECURE is False. Set this to True to avoid transmitting the CSRF cookie over HTTP accidentally.\n\n{IssueDocLinks.CSRF_COOKIE_SECURE}\n',
                IssueSeverity.WARNING,
                IssueDocLinks.CSRF_COOKIE_SECURE
            )

    def check_session_cookie(self, value: str, line: int):
        if value == 'False':
            LOGGER.debug('SESSION_COOKIE_SECURE is set to False')
            self.add_security_issue(
                'session_cookie_secure_false',
                line,
                f'SESSION_COOKIE_SECURE is False. Set this to True to avoid transmitting the session cookie over HTTP accidentally.\n\n{IssueDocLinks.SESSION_COOKIE_SECURE}\n',
                IssueSeverity.WARNING,
                IssueDocLinks.SESSION_COOKIE_SECURE
            )

    def _get_django_class_type(self, bases):
        for base in bases:
            if isinstance(base, ast.Name) and self._is_django_component(base.id):
                return self._get_component_type(base.id)
            elif isinstance(base, ast.Attribute) and self._is_django_component(base.attr):
                return self._get_component_type(base.attr)
        return None

    def _is_django_component(self, name):
        return any(name in components for components in DJANGO_COMPONENTS.values())

    def _get_component_type(self, name):
        for component, names in DJANGO_COMPONENTS.items():
            if name in names:
                return f'django_{component}'
        return None

    def contains_query_method(self, node):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                return node.func.attr in QUERY_METHODS
        return any(self.contains_query_method(child) for child in ast.iter_child_nodes(node))

    def add_security_issue(self, issue_type: str, line: int, message: str, severity: str, doc_link: str = None):
        LOGGER.debug(f'Adding security issue: {issue_type} - {message}')

        self.security_issues.append({
            'type': issue_type,
            'line': line,
            'message': message,
            'severity': severity,
            'doc_link': doc_link
        })

    def perform_security_checks(self):
        LOGGER.info('Running security checks...')
        for node in ast.walk(ast.parse(self.source_code)):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        self.check_assignment_security(target.id, node.value, node.lineno)
        LOGGER.info(f'Security checks complete. Found {len(self.security_issues)} issues.')

    def parse_code(self):
        try:
            result = super().parse_code()
            self.perform_security_checks()
            scored_issues = NPlusOneScorer.calculate_issue_scores(self.nplusone_issues, self.source_code)
        except Exception as e:
            LOGGER.error(f'Error parsing Django code: {e}')

        return {
            **result,
            "nplusone_issues": scored_issues,
        }

def main():
    input_code = sys.stdin.read()
    analyzer = DjangoAnalyzer(input_code)
    LOGGER.info("Django analyzer initialized")
    parsed_code = analyzer.parse_code()
    print(json.dumps(parsed_code, default=serialize_file_data))

if __name__ == "__main__":
    main()
