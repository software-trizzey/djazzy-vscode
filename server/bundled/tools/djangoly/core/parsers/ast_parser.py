import ast
import keyword
import builtins
import tokenize

from io import StringIO
from typing import Dict, Any

from djangoly.core.diagnostics import Diagnostic
from djangoly.core.utils.issue import IssueSeverity
from djangoly.core.checks.name_validator.checker import NameValidator

from ..utils.constants import DJANGO_IGNORE_FUNCTIONS
from ..utils.log import LOGGER


class Analyzer(ast.NodeVisitor):
    def __init__(self, current_file_path: str, source_code: str, conventions: Dict[str, Any], settings: Dict[str, Any]):
        self.current_file_path = current_file_path
        self.source_code = source_code
        self.tree = None
        self.diagnostics = []
        self.comments = []
        self.pending_comments = []
        self.url_patterns = []
        self.current_class_type = None
        self.in_class = False

        self.name_validator = NameValidator(conventions, settings)

    def is_python_reserved(self, name: str) -> bool:
        return keyword.iskeyword(name) or hasattr(builtins, name)

    def get_comments(self):
        tokens = tokenize.generate_tokens(StringIO(self.source_code).readline)
        previous_line = 0
        for token_number, token_value, start, end, _ in tokens:
            if token_number == tokenize.COMMENT:
                if start[0] - 1 == previous_line:
                    self.pending_comments.append({
                        'type': 'comment',
                        'value': token_value.strip('#').strip(),
                        'line': start[0] - 1,
                        'col_offset': start[1],
                        'end_col_offset': end[1]
                    })
                else:
                    self.comments.extend(self.pending_comments)
                    self.pending_comments = [{
                        'type': 'comment',
                        'value': token_value.strip('#').strip(),
                        'line': start[0] - 1,
                        'col_offset': start[1],
                        'end_col_offset': end[1]
                    }]
                previous_line = start[0]
            else:
                previous_line = end[0]
        self.comments.extend(self.pending_comments)

    def get_related_comments(self, node):
        related_comments = []
        for comment in self.comments:
            if comment['line'] == node.lineno - 2:
                related_comments.append(comment)
        return related_comments
    
    def add_diagnostic(self, **kwargs):
        diagnostic = Diagnostic(
            file_path=self.current_file_path,
            line=kwargs.get("line"),
            col_offset=kwargs.get("col_offset"),
            end_col_offset=kwargs.get("end_col_offset"),
            severity=kwargs.get("severity", IssueSeverity.INFORMATION),
            message=kwargs.get("message", ''),
            issue_code=kwargs.get("issue_code", ''),
            related_issues=kwargs.get('related_issues', [])
        )

        for key, value in kwargs.items():
            if not hasattr(diagnostic, key):
                setattr(diagnostic, key, value)

        self.diagnostics.append(diagnostic)

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

        symbol_type = 'function'
        if self.in_class and self.current_class_type:
            symbol_type = f'{self.current_class_type}_method'

        function_name_issue = self.name_validator.validate_function_name(
            function_name=node.name,
            function_body={"bodyLength": len(node.body)},
            lineno=function_start_line,
            col=function_start_col
        )

        if function_name_issue:
            self.add_diagnostic(
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
                arguments=arguments
            )
        
        self.generic_visit(node)

    def get_function_body(self, node):
        source_lines = self.source_code.splitlines()
        if not node.body:
            return [], ""
        
        start_line = node.body[0].lineno - 1
        end_line = (node.body[-1].end_lineno if hasattr(node.body[-1], 'end_lineno') else node.body[-1].lineno) - 1
        
        body_with_lines = []
        raw_body_lines = []
        
        for line_index, line in enumerate(source_lines[start_line:end_line + 1], start=start_line + 1):
            if line_index == start_line + 1:
                first_node = node.body[0]
                start_col = first_node.col_offset
            else:
                start_col = len(line) - len(line.lstrip())
            
            if line_index == end_line + 1:
                end_col = (node.body[-1].end_col_offset 
                        if hasattr(node.body[-1], 'end_col_offset') 
                        else len(line.rstrip()))
            else:
                end_col = len(line.rstrip())
            
            body_with_lines.append({
                'relative_line_number': line_index - start_line,
                'absolute_line_number': line_index,
                'start_col': start_col,
                'end_col': end_col,
                'content': line,
            })
            raw_body_lines.append(line)
        
        raw_body = '\n'.join(raw_body_lines)
        
        return body_with_lines, raw_body
    

    def extract_arguments(self, args_node):
        arguments = []
        defaults = args_node.defaults
        num_non_default_args = len(args_node.args) - len(defaults)

        for index, arg in enumerate(args_node.args):
            default_value = None
            if index >= num_non_default_args:
                default_value_node = defaults[index - num_non_default_args]
                if isinstance(default_value_node, ast.Dict):
                    # Treat dictionaries as separate symbols for validation
                    self.handle_dictionary(default_value_node, arg)
                    default_value = ast.get_source_segment(self.source_code, default_value_node)
                else:
                    default_value = ast.get_source_segment(self.source_code, default_value_node)
            arg_info = {
                'name': arg.arg,
                'line': arg.lineno,
                'col_offset': arg.col_offset,
                'default': default_value
            }
            arguments.append(arg_info)

        if args_node.vararg:
            arguments.append({
                'name': args_node.vararg.arg,
                'line': args_node.vararg.lineno,
                'col_offset': args_node.vararg.col_offset,
                'default': None
            })
        if args_node.kwarg:
            arguments.append({
                'name': args_node.kwarg.arg,
                'line': args_node.kwarg.lineno,
                'col_offset': args_node.kwarg.col_offset,
                'default': None
            })

        return arguments

    def visit_Assign(self, node):
        for target in node.targets:
            if isinstance(target, ast.Name):
                value_source = ast.get_source_segment(self.source_code, node.value)
                comments = self.get_related_comments(node)

                variable_issue = self.name_validator.validate_variable_name(
                    variable_name=target.id,
                    variable_value=value_source,
                    lineno=target.lineno,
                    col=target.col_offset
                )

                if variable_issue:
                    symbol_type = 'assignment'
                    if self.in_class and self.current_class_type:
                        symbol_type = f'{self.current_class_type}_field'

                    self.add_diagnostic(
                        type=symbol_type,
                        name=target.id,
                        comments=comments,
                        line=variable_issue.lineno,
                        col_offset=variable_issue.col,
                        end_col_offset=variable_issue.col + len(target.id),
                        is_reserved=False,
                        message=variable_issue.message,
                        issue_code=variable_issue.code,
                        value=value_source
                    )

        self.generic_visit(node)

    def visit_Dict(self, node):
        comments = self.get_related_comments(node)
        for parent in ast.walk(node):
            if isinstance(parent, ast.Assign):
                targets = [t.id for t in parent.targets if isinstance(t, ast.Name)]
                if targets:
                    name = targets[0]

                    # Validate dictionary keys
                    for key, value in zip(node.keys, node.values):
                        if isinstance(key, ast.Constant):
                            dictionary_issue = self.name_validator.validate_object_property_name(
                                object_key=str(key.value),
                                object_value=ast.get_source_segment(self.source_code, value),
                                lineno=key.lineno,
                                col=key.col_offset
                            )

                            if dictionary_issue:
                                self.add_diagnostic(
                                    type='dictionary',
                                    name=name,
                                    comments=comments,
                                    message=dictionary_issue.message,
                                    line=dictionary_issue.lineno,
                                    col_offset=dictionary_issue.col,
                                    end_col_offset=node.end_col_offset if hasattr(node, 'end_col_offset') else None,
                                    issue_code=dictionary_issue.code,
                                    is_reserved=False,
                                    value=ast.get_source_segment(self.source_code, node)
                                )
        self.generic_visit(node)

    def visit_For(self, node):
        comments = self.get_related_comments(node)
        target_positions = []

        def add_target_positions(target_node):
            if isinstance(target_node, ast.Name):
                return [(target_node.id, target_node.lineno - 1, target_node.col_offset)]
            elif isinstance(target_node, ast.Tuple):
                positions = []
                for elt in target_node.elts:
                    if isinstance(elt, ast.Name):
                        positions.append((elt.id, elt.lineno - 1, elt.col_offset))
                return positions
            return []

        target_positions.extend(add_target_positions(node.target))

        # Validate the for loop target variable names
        for variable_name, line, col in target_positions:
            variable_issue = self.name_validator.validate_variable_name(
                variable_name=variable_name,
                variable_value=None,  # for loop targets typically don't have an immediate value
                lineno=line + 1,  # adjust since AST lineno is 1-based
                col=col
            )

            if variable_issue:
                self.add_diagnostic(
                    type='for_loop',
                    name=None,
                    message=variable_issue.message,
                    issue_code=variable_issue.code,
                    comments=comments,
                    line=variable_issue.lineno,
                    col_offset=variable_issue.col,
                    end_col_offset=node.end_col_offset if hasattr(node, 'end_col_offset') else None,
                    is_reserved=False,
                    body=ast.get_source_segment(self.source_code, node),
                    target_positions=target_positions
                )
        self.generic_visit(node)

    def parse_code(self) -> Dict[str, Any]:
        LOGGER.debug("Running parser...")
        try:
            self.get_comments()
            self.tree = ast.parse(self.source_code)
            self.visit(self.tree)
            LOGGER.debug(f"Parsing complete. Found {len(self.diagnostics)} diagnostics.")
        except (SyntaxError, IndentationError) as e:
            LOGGER.error(f"Syntax error in code: {str(e)}")
        except Exception as e:
            LOGGER.error(f"Unexpected error during parsing: {str(e)}")
        return {
            "diagnostics": self.diagnostics,
            "diagnostics_count": len(self.diagnostics)
        }