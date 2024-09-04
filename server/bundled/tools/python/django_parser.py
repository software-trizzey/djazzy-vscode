import ast
import json
import sys
from typing import Optional

from log import LOGGER
from constants import DJANGO_IGNORE_FUNCTIONS

from ast_parser import Analyzer

from checks.security import SecurityCheckService
from checks.model_fields import ModelFieldCheckService
from checks.skinny_views.checker import ViewComplexityAnalyzer
from checks.skinny_views.scorer import ViewComplexityScorer, ScoreThresholds
from checks.exception_handlers.checker import ExceptionHandlingCheckService

from issue import IssueSeverity
from services.view_detector import DjangoViewDetectionService, DjangoViewType
from services.function_node import FunctionNodeService

from util import serialize_file_data


class DjangoAnalyzer(Analyzer):
    def __init__(self, source_code, model_cache_json: str):
        super().__init__(source_code)
        self.current_django_class_type = None
        self.model_cache = self.parse_model_cache(model_cache_json)
        self.class_type_cache = {}
        self.class_definitions = {}
        self.security_service = SecurityCheckService(source_code)
        self.security_issues = []
        self.model_field_check_service = ModelFieldCheckService(source_code)
        self.view_detection_service = DjangoViewDetectionService()
        # TODO: make configurable based on user settings
        self.complexity_scorer = ViewComplexityScorer(ScoreThresholds(line_threshold=100, operation_threshold=25))
        self.complexity_analyzer = ViewComplexityAnalyzer(source_code, self.complexity_scorer)
        self.exception_handler_service = ExceptionHandlingCheckService(source_code)
        self.function_node_service = FunctionNodeService()

    def parse_model_cache(self, model_cache_json):
        try:
            return json.loads(model_cache_json)
        except json.JSONDecodeError as e:
            LOGGER.error(f"Error parsing model cache JSON: {e}")
            return {}
        
    def get_model_info(self, model_name: str) -> Optional[dict]:
        model_info = self.model_cache.get(model_name)
        if model_info:
            LOGGER.debug(f"Found model info for {model_name}: {model_info}")
            return model_info
        else:
            LOGGER.debug(f"Model info for {model_name} not found in cache")
            return None
        
    def get_class_definitions(self):
        """
        Collect class definitions in the AST.
        """
        LOGGER.debug("Collecting Django class definitions...")
        for node in ast.walk(self.tree):
            if isinstance(node, ast.ClassDef):
                self.class_definitions[node.name] = node
        LOGGER.debug(f"Collected {len(self.class_definitions)} class definitions.")

    def check_function_node_for_issues(self, node, symbol_type, body, body_with_lines, function_start_line, function_end_line, function_start_col, function_end_col, decorators, calls, arguments, is_reserved):
        """Check for complexity and exception handling issues."""
        message, severity, issue_code = None, None, None

        if symbol_type == DjangoViewType.FUNCTIONAL_VIEW:
            try:
                complexity_issue = self.complexity_analyzer.run_complexity_analysis(node)
                if complexity_issue:
                    issue_code = complexity_issue.code
                    message = complexity_issue.message
                    severity = complexity_issue.severity
            except RecursionError:
                LOGGER.error(f"Caught Recursion error while running complexity analysis on {node.name}")
                message = "Encountered error occurred during complexity analysis"
                severity = IssueSeverity.INFORMATION

            exception_handling_issue = self.exception_handler_service.run_check(node)
            if exception_handling_issue:
                # We're intentionally creating a separate issue for exception handling
                self.symbols.append(self._create_symbol_dict(
                    type=DjangoViewType.FUNCTIONAL_VIEW,
                    name=node.name,
                    message=exception_handling_issue.message,
                    severity=exception_handling_issue.severity,
                    line=node.lineno,
                    col_offset=node.col_offset,
                    end_col_offset=node.col_offset + len(node.name),
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

        return message, severity, issue_code

    def visit_ClassDef(self, node):
        self.in_class = True
        class_type = self.view_detection_service.get_django_class_type(node, self.class_definitions)

        if class_type == 'django_model':
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
        elif class_type == DjangoViewType.CLASS_VIEW:
            issue = self.complexity_analyzer.run_complexity_analysis(node)
            LOGGER.debug(f"Ran complexity analysis on {node.name}")
            if issue:
                LOGGER.info(f'Complexity issue detected for view class {node.name}: {issue}')
                comments = self.get_related_comments(node)
                self.symbols.append(self._create_symbol_dict(
                    type=DjangoViewType.CLASS_VIEW,
                    name=node.name,
                    message=issue.message,
                    severity=issue.severity,
                    issue_code=issue.code,
                    comments=comments,
                    line=node.lineno,
                    col_offset=node.col_offset,
                    end_col_offset=node.col_offset + len(node.name),
                    is_reserved=False
                ))
            self.current_django_class_type = DjangoViewType.CLASS_VIEW
        else:
            self.current_django_class_type = None

        self.generic_visit(node)

        self.in_class = False
        self.current_django_class_type = None

    def visit_FunctionDef(self, node):
        comments = self.get_related_comments(node)
        is_reserved = DJANGO_IGNORE_FUNCTIONS.get(node.name, False) or self.is_python_reserved(node.name)
        function_start_line, function_start_col = node.lineno, node.col_offset

        function_end_line, function_end_col = self.function_node_service.get_function_end_position(node, self.source_code)
        if not node.body:
            function_end_line, function_end_col = self.function_node_service.get_empty_function_position(function_start_line, function_start_col, node.name)

        body_with_lines, body = self.get_function_body(node)
        decorators = [ast.get_source_segment(self.source_code, decorator) for decorator in node.decorator_list]
        calls = []
        arguments = self.extract_arguments(node.args)

        self.visit_FunctionBody(node.body, calls)

        symbol_type = self.function_node_service.get_symbol_type(node, self.in_class, self.current_django_class_type, self.view_detection_service)
        message, severity, issue_code = self.check_function_node_for_issues(node, symbol_type, body, body_with_lines, function_start_line, function_end_line, function_start_col, function_end_col, decorators, calls, arguments, is_reserved)

        self.symbols.append(self._create_symbol_dict(
            type=symbol_type,
            name=node.name,
            message=message,
            severity=severity,
            issue_code=issue_code,
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

    def parse_code(self):
        try:
            LOGGER.info("Parsing Django code")
            self.get_comments()
            self.tree = ast.parse(self.source_code)
            self.get_class_definitions()

            super().visit(self.tree)
            self.view_detection_service.initialize(self.tree)

            self.security_service.run_security_checks()
            self.security_issues = self.security_service.get_formatted_security_issues()

            return {
                "symbols": self.symbols,
                "security_issues": self.security_issues,
            }
        except SyntaxError as e:
            return {
                "symbols": self.symbols,
                "security_issues": self.security_issues,
                "error": "Syntax error detected",
                "details": str(e)
            }
        except Exception as e:
            LOGGER.error(f'Error parsing Django code: {e}')
            return {
                "symbols": self.symbols,
                "security_issues": self.security_issues,
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
