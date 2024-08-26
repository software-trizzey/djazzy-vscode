import ast
import json
import sys

from log import LOGGER
from constants import (
    QUERY_METHODS,
    DJANGO_COMPONENTS,
    DJANGO_IGNORE_FUNCTIONS,
)

from ast_parser import Analyzer
from nplusone.nplusone_analyzer import NPlusOneDetector
from nplusone.scorer import NPlusOneScorer

from checks.security import SecurityCheckService
from checks.model_fields import ModelFieldCheckService
from checks.skinny_views.checker import ViewComplexityAnalyzer
from checks.skinny_views.scorer import ViewComplexityScorer, ScoreThresholds
from util import serialize_file_data, is_django_model_class


class DjangoAnalyzer(Analyzer):
    def __init__(self, source_code, model_cache_json: str):
        super().__init__(source_code)
        self.current_django_class_type = None
        self.model_cache = self.parse_model_cache(model_cache_json)
        self.nplusone_analyzer = NPlusOneDetector(source_code)
        self.nplusone_issues = []
        self.security_service = SecurityCheckService(source_code)
        self.security_issues = []
        self.model_field_check_service = ModelFieldCheckService(source_code)
        # TODO: make configurable based on user settings
        self.complexity_scorer = ViewComplexityScorer(ScoreThresholds(line_threshold=50, operation_threshold=10))
        self.complexity_analyzer = ViewComplexityAnalyzer(source_code, self.complexity_scorer)

    def parse_model_cache(self, model_cache_json):
        try:
            return json.loads(model_cache_json)
        except json.JSONDecodeError as e:
            LOGGER.error(f"Error parsing model cache JSON: {e}")
            return {}

    def visit_ClassDef(self, node):
        self.in_class = True
        class_definitions = None
        if self.tree:
            class_definitions = {
                class_node.name: class_node for class_node in ast.walk(self.tree) if isinstance(class_node, ast.ClassDef)
            }

        # Check if this class or any of its parent classes inherit from models.Model
        if is_django_model_class(node, class_definitions, self.model_cache):
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

        if self.is_django_view_class(node):
            issue = self.complexity_analyzer.run_complexity_analysis(node)
            if issue:
                LOGGER.debug(f'Complexity issue detected for view class {node.name.value}: {issue}')
                # TODO: add issue properties as fields to symbol
                self.symbols.append(self._create_symbol_dict(
                    type='django_view',
                    name=node.name.value,
                    message=issue.message,
                    severity=issue.severity,
                    comments=comments,
                    line=node.lineno,
                    col_offset=node.col_offset,
                    end_col_offset=node.col_offset + len(node.name.value),
                    is_reserved=False
                ))
                LOGGER.info()
            self.current_django_class_type = 'django_view'
        else:
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

        message = None
        severity = None
        if self.in_class and self.current_django_class_type:
            symbol_type = f'{self.current_django_class_type}_method'
        elif self.is_django_view_function(node):
            symbol_type = 'django_view'
            issue = self.complexity_analyzer.run_complexity_analysis(node)
            if issue:
                message = issue.message
                severity = issue.severity
        else:
            symbol_type = 'function'

        self.symbols.append(self._create_symbol_dict(
            type=symbol_type,
            name=node.name,
            message=message,
            severity=severity,
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

                field_check_results = self.model_field_check_service.run_model_field_checks(node)
                
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
                    has_set_foreign_key_related_name=field_check_results["has_related_name_field"],
                    has_set_foreign_key_on_delete=field_check_results["has_on_delete_field"],
                    is_charfield_or_textfield_nullable=field_check_results["is_charfield_or_textfield_nullable"],
                    full_line_length=full_line_length
                ))
        
        self.generic_visit(node)

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
    
    def is_django_view_function(self, node):
        """
        Simple check to see if the function is a Django view function based on its location or decorators.
        """
        return any(decorator.id == 'view' for decorator in node.decorator_list if isinstance(decorator, ast.Name)) or 'views' in self.source_code

    def is_django_view_class(self, node):
        """
        Check if the class is a Django view class based on inheritance or its location.
        """
        return any(base.attr == 'View' for base in node.bases if isinstance(base, ast.Attribute)) or 'views' in self.source_code

    def get_nplusone_issues(self):
        return self.nplusone_analyzer.analyze()

    def parse_code(self):
        try:
            LOGGER.info("Parsing Django code")
            result = super().parse_code()

            self.security_service.run_security_checks()
            self.security_issues = self.security_service.get_formatted_security_issues()

            nplusone_issues = self.get_nplusone_issues()
            scored_issues = NPlusOneScorer.calculate_issue_scores(nplusone_issues)

            return {
                **result,
                "security_issues": self.security_issues,
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
