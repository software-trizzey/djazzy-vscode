import ast
import json
import re
import sys

from typing import Optional

from ast_parser import Analyzer, serialize_file_data
from nplusone.nplusone_analyzer import NPlusOneDetector
from nplusone.scorer import NPlusOneScorer
from log import LOGGER
from constants import (
	ALLOWED_HOSTS,
    QUERY_METHODS,
    CSRF_COOKIE_SECURE,
    DEBUG, DJANGO_COMPONENTS,
    DJANGO_IGNORE_FUNCTIONS,
    SECRET_KEY,
    SESSION_COOKIE,
    IssueDocLinks,
    IssueSeverity
)

class DjangoAnalyzer(Analyzer):
    def __init__(self, source_code, model_cache_json: str):
        super().__init__(source_code)
        self.current_django_class_type = None
        self.model_cache = self.parse_model_cache(model_cache_json)
        self.nplusone_analyzer = NPlusOneDetector(source_code)
        self.nplusone_issues = []
        self.flag_cursor_detection = True # TODO: make this a setting
        self.processed_nodes = set()

    def parse_model_cache(self, model_cache_json):
        try:
            return json.loads(model_cache_json)
        except json.JSONDecodeError as e:
            LOGGER.error(f"Error parsing model cache JSON: {e}")
            return {}
        
    def get_model_info(self, model_name: str) -> Optional[dict]:
        """
        Retrieves model information from the model cache.
        Args:
            model_name (str): The name of the model class to retrieve information for.

        Returns:
            Optional[dict]: A dictionary containing fields, relationships, and parent models,
                            or None if the model is not found.
        """
        model_info = self.model_cache.get(model_name)
        if model_info:
            LOGGER.debug(f"Found model info for {model_name}: {model_info}")
            return model_info
        else:
            LOGGER.debug(f"Model info for {model_name} not found in cache")
            return None
        
    def visit_Call(self, node):
        node_id = (node.lineno, node.col_offset)
        if node_id in self.processed_nodes:
            return

        self.processed_nodes.add(node_id)

        if isinstance(node.func, ast.Attribute):
            if node.func.attr == "raw":
                self.add_raw_sql_issue(node)

            if self.flag_cursor_detection:
                if self.is_connection_cursor(node.func):
                    self.add_raw_sql_issue(node, is_using_cursor=True, severity=IssueSeverity.INFORMATION)

        self.generic_visit(node)

    def visit_ClassDef(self, node):
        self.in_class = True
        class_definitions = None
        if self.tree:
            class_definitions = {
                class_node.name: class_node for class_node in ast.walk(self.tree) if isinstance(class_node, ast.ClassDef)
            }

        # Check if this class or any of its parent classes inherit from models.Model
        if self.is_django_model_class(node, class_definitions):
            comments = self.get_related_comments(node)
            self.symbols.append(self._create_symbol_dict(
                type='django_model',
                name=node.name,
                comments=comments,
                line=node.lineno,
                col_offset=node.col_offset,
                end_col_offset=node.col_offset + len(node.name),
                is_reserved=False
            ))
            self.current_django_class_type = 'django_model'
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
        ))

        self.generic_visit(node)
        self.nplusone_analyzer.analyze_function(node)

    def visit_Assign(self, node):
        for target in node.targets:
            if isinstance(target, ast.Name):
                value_source = ast.get_source_segment(self.source_code, node.value)
                comments = self.get_related_comments(node)

                has_related_name_field = self.check_foreign_key_related_name(node)
                has_on_delete_field = self.check_foreign_key_on_delete(node)
                is_charfield_or_textfield_nullable = self.check_charfield_and_textfield_is_nullable(node)
                
                if self.in_class and self.current_django_class_type:
                    symbol_type = f'{self.current_django_class_type}_field'
                else:
                    symbol_type = 'assignment'

                full_line_text = self.source_code.splitlines()[node.lineno - 1]
                full_line_length = len(full_line_text) 
                
                self.symbols.append(self._create_symbol_dict(
                    type=symbol_type,
                    name=target.id,
                    comments=comments,
                    line=node.lineno,
                    col_offset=target.col_offset,
                    end_col_offset=target.col_offset + len(target.id),
                    is_reserved=False,
                    value=value_source,
                    has_set_foreign_key_related_name=has_related_name_field,
                    has_set_foreign_key_on_delete=has_on_delete_field,
                    is_charfield_or_textfield_nullable=is_charfield_or_textfield_nullable,
                    full_line_length=full_line_length
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

    def check_foreign_key_related_name(self, node) -> Optional[bool]:
        """
        Helper method to check if a ForeignKey field has a related_name argument.
        Returns:
            - True: If related_name is present in ForeignKey
            - False: If ForeignKey does not have related_name
            - None: If the field is not a ForeignKey
        """
        if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute):
            if node.value.func.attr == 'ForeignKey':
                for keyword in node.value.keywords:
                    if keyword.arg == 'related_name':
                        return True
                return False
        return None
    
    def check_foreign_key_on_delete(self, node) -> Optional[bool]:
        """
        Helper method to check if a ForeignKey field has an on_delete argument.
        Returns:
            - True: If on_delete is present in ForeignKey
            - False: If ForeignKey does not have on_delete
            - None: If the field is not a ForeignKey
        """
        if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute):
            if node.value.func.attr == 'ForeignKey':
                for keyword in node.value.keywords:
                    if keyword.arg == 'on_delete':
                        return True
                return False
        return None

    def check_charfield_and_textfield_is_nullable(self, node):
        """
        Helper method to check if a CharField or TextField has null=True.
        Returns:
            - True: If null=True is present in CharField or TextField
            - False: If CharField or TextField does not have null=True
            - None: If the field is not a CharField or TextField
        """
        if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute):
            if node.value.func.attr in ['CharField', 'TextField']:
                for keyword in node.value.keywords:
                    if keyword.arg == 'null' and keyword.value.value == True:
                        return True
                return False
        return None

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
    
    def is_connection_cursor(self, func):
        if isinstance(func, ast.Attribute):
            if func.attr == "cursor":
                if isinstance(func.value, ast.Name) and func.value.id == "connection":
                    return True
            return self.is_connection_cursor(func.value)
        return False
    
    def is_django_model_class(self, node, class_definitions):
        if not isinstance(node, ast.ClassDef):
            return False

        for base in node.bases:
            # Direct check for 'models.Model'
            if isinstance(base, ast.Attribute) and base.attr == 'Model' and base.value.id == 'models':
                LOGGER.debug(f"Found direct subclass of models.Model for {node.name}")
                return True

            # Recursively check each parent class in the chain
            if isinstance(base, ast.Name) and base.id in class_definitions:
                parent_class = class_definitions[base.id]
                LOGGER.debug(f"Checking parent class {base.id} for {node.name}")
                if self.is_django_model_class(parent_class, class_definitions):
                    LOGGER.debug(f"Model {node.name} is a django model with a parent of {base.id}")
                    return True

            if isinstance(base, ast.Name):
                LOGGER.debug(f"Checking parent models for {base.id}")
                parent_model_info = self.get_model_info(base.id)  # Fetch cached model info
                if parent_model_info:
                    LOGGER.debug(f"Parent model info for {base.id}: {parent_model_info}")
                    # Recursively check if any of the parent models are Django models
                    for parent_model in parent_model_info['parent_models']:
                        LOGGER.debug(f"Checking if {parent_model} is a Django model for {node.name}")
                        if parent_model == 'models.Model':
                            LOGGER.debug(f"Model {node.name} is a django model because its parent is models.Model")
                            return True
                        if parent_model in class_definitions:
                            parent_class = class_definitions[parent_model]
                            if self.is_django_model_class(parent_class, class_definitions):
                                LOGGER.debug(f"Model {node.name} is a django model with a parent of {parent_model}")
                                return True
        LOGGER.debug(f"Model {node.name} is not a django model")
        return False

    def add_security_issue(self, issue_type: str, line: int, message: str, severity: str, doc_link: str = None):
        LOGGER.debug(f'Adding security issue: {issue_type} - {message}')

        self.security_issues.append({
            'type': issue_type,
            'line': line,
            'message': message,
            'severity': severity,
            'doc_link': doc_link
        })

    def add_raw_sql_issue(self, node, is_using_cursor=False, severity=IssueSeverity.WARNING):
        """
        Adds an issue if a raw() SQL query or connection.cursor() SQL execution is detected.
        """
        LOGGER.debug(f"Raw SQL query detected for {node.func.attr} at line {node.lineno}")
        raw_query_line_number = node.lineno

        if is_using_cursor:
            message = (
                "Avoid using 'connection.cursor()' to execute raw SQL queries directly. "
                "This can bypass Django's ORM protections against SQL injection and reduce database portability. "
                "Consider using Django's ORM instead."
            )
        else:
            message = (
                "Avoid using 'raw()' SQL queries directly. This can bypass Django's ORM protections "
                "against SQL injection and reduce database portability. Consider using Django's ORM instead."
            )

        self.add_security_issue(
            issue_type="raw_sql_usage",
            line=raw_query_line_number,
            message=message,
            severity=severity,
            doc_link=IssueDocLinks.RAW_SQL_USAGE
        )

    def get_nplusone_issues(self):
        return self.nplusone_analyzer.analyze()

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
            nplusone_issues = self.get_nplusone_issues()
            scored_issues = NPlusOneScorer.calculate_issue_scores(nplusone_issues)
            return {
                **result,
                "nplusone_issues": scored_issues,
            }
        except SyntaxError as e:
            LOGGER.warning(f'Syntax error in Django code: {e}. Continuing with partial analysis.')
            return {
                "symbols": self.symbols,
                "security_issues": self.security_issues,
                "nplusone_issues": self.nplusone_issues,
                "error": "Syntax error detected",
                "details": str(e)
            }
        except Exception as e:
            LOGGER.error(f'Error parsing Django code: {e}')
            return {
                "symbols": self.symbols,
                "security_issues": self.security_issues,
                "nplusone_issues": self.nplusone_issues,
                "error": "General error detected",
                "details": str(e)
            }


def main():
    if len(sys.argv) < 2:
        LOGGER.error("Usage: python script.py <model_cache_json>")
        sys.exit(1)

    model_cache_json = sys.argv[1]
    input_code = sys.stdin.read()
    analyzer = DjangoAnalyzer(input_code, model_cache_json)
    LOGGER.info("Django analyzer initialized")
    parsed_code = analyzer.parse_code()
    print(json.dumps(parsed_code, default=serialize_file_data))

if __name__ == "__main__":
    main()
