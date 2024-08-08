import ast
import keyword
import builtins
import json
import sys
import tokenize
from io import StringIO
from typing import Dict, Any, List

from log import LOGGER


DJANGO_IGNORE_FUNCTIONS = {
    "save": True,
    "delete": True,
    "__str__": True,
    "clean": True,
    "get_absolute_url": True,
    "create": True,
    "update": True,
    "validate": True,
    "get_queryset": True,
    "get": True,
    "post": True,
    "put": True,
    "get_context_data": True,
    "validate_<field_name>": True,
    "delete": True,
    "perform_create": True,
}

def serialize_file_data(obj):
    if isinstance(obj, ast.AST):
        return {k: serialize_file_data(v) for k, v in ast.iter_fields(obj)}
    elif isinstance(obj, list):
        return [serialize_file_data(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: serialize_file_data(v) for k, v in obj.items()}
    else:
        return str(obj)

class DjangoURLPatternVisitor(ast.NodeVisitor):
    def __init__(self):
        self.url_patterns = []

    def visit_Assign(self, node):
        if isinstance(node.targets[0], ast.Name) and node.targets[0].id == 'urlpatterns':
            if isinstance(node.value, ast.List):
                for elt in node.value.elts:
                    if isinstance(elt, ast.Call) and isinstance(elt.func, ast.Name):
                        if elt.func.id in ['path', 're_path', 'url']:
                            pattern = {
                                'type': elt.func.id,
                                'route': None,
                                'view': None,
                                'name': None,
                                'line': elt.lineno,
                                'col': elt.col_offset,
                                'end_line': elt.end_lineno,
                                'end_col': elt.end_col_offset
                            }
                            
                            for currentIndex, arg in enumerate(elt.args):
                                if currentIndex == 0 and isinstance(arg, ast.Constant):
                                    pattern['route'] = arg.value
                                elif currentIndex == 1:
                                    if isinstance(arg, ast.Name):
                                        pattern['view'] = arg.id
                                    elif isinstance(arg, ast.Attribute):
                                        pattern['view'] = f"{arg.value.id}.{arg.attr}"
                            
                            for keyword in elt.keywords:
                                if keyword.arg == 'name' and isinstance(keyword.value, ast.Constant):
                                    pattern['name'] = keyword.value.value
                            
                            self.url_patterns.append(pattern)

class Analyzer(ast.NodeVisitor):
    def __init__(self, source_code):
        self.source_code = source_code
        self.symbols = []
        self.comments = []
        self.pending_comments = []
        self.url_patterns = []
        self.security_issues: List[Dict[str, Any]] = []
        self.current_class_type = None
        self.in_class = False

    def is_python_reserved(self, name: str) -> bool:
        """
        Check if the given name is a Python reserved keyword or a built-in function/method.
        """
        return keyword.iskeyword(name) or hasattr(builtins, name)

    def get_comments(self):
        tokens = tokenize.generate_tokens(StringIO(self.source_code).readline)
        previous_line = 0
        for token_number, token_value, start, end, _ in tokens:
            if token_number == tokenize.COMMENT:
                if start[0] - 1 == previous_line:  # Directly following the previous line
                    self.pending_comments.append({
                        'type': 'comment',
                        'value': token_value.strip('#').strip(),
                        'line': start[0] - 1,
                        'col_offset': start[1],
                        'end_col_offset': end[1]
                    })
                else:
                    # Flush pending comments if they are not followed by another comment directly
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
            if comment['line'] == node.lineno - 2:  # Directly above the node
                related_comments.append(comment)
        return related_comments

    def _create_symbol_dict(self, **kwargs):
        symbol = {
            'type': kwargs.get('type'),
            'name': kwargs.get('name'),
            'leading_comments': kwargs.get('comments', []),
            'line': kwargs.get('line'),
            'col_offset': kwargs.get('col_offset'),
            'end_col_offset': kwargs.get('end_col_offset'),
            'is_reserved': kwargs.get('is_reserved', False),
        }
        
        if 'value' in kwargs:
            symbol['value'] = kwargs['value']
        if kwargs.get('body_with_lines'):
            symbol['body_with_lines'] = kwargs['body_with_lines']
        if kwargs.get('body'):
            symbol['body'] = kwargs['body']
        if kwargs.get('function_start_line') is not None:
            symbol['function_start_line'] = kwargs['function_start_line']
        if kwargs.get('function_end_line') is not None:
            symbol['function_end_line'] = kwargs['function_end_line']
        if kwargs.get('function_start_col') is not None:
            symbol['function_start_col'] = kwargs['function_start_col']
        if kwargs.get('function_end_col') is not None:
            symbol['function_end_col'] = kwargs['function_end_col']
        if kwargs.get('decorators'):
            symbol['decorators'] = kwargs['decorators']
        if kwargs.get('calls'):
            symbol['calls'] = kwargs['calls']
        if kwargs.get('arguments'):
            symbol['arguments'] = kwargs['arguments']
        if kwargs.get('high_priority'):
            symbol['high_priority'] = kwargs['high_priority']
        
        return symbol

    def generic_node_visit(self, node):
        comments = self.get_related_comments(node)
        name = getattr(node, 'name', None)
        col_offset = node.col_offset
        end_col_offset = col_offset + (len(name) if name else 0)
        function_start_line = node.lineno
        function_end_line = node.lineno
        is_reserved = False
        body = None
        value = None
        decorators = [ast.get_source_segment(self.source_code, decorator) for decorator in getattr(node, 'decorator_list', [])]
        calls = []
        arguments = []

        if isinstance(node, ast.ClassDef):
            col_offset += len('class ')
        elif isinstance(node, ast.Assign):
            targets = [target.id for target in node.targets if isinstance(target, ast.Name)]
            if targets:
                name = targets[0]
            value_node = node.value
            value = ast.get_source_segment(self.source_code, value_node)
            if isinstance(value_node, ast.Dict):
                self.handle_dictionary(value_node, node)
        elif isinstance(node, ast.For):
            self.visit_For(node)

        self.symbols.append(self._create_symbol_dict(
            type=node.__class__.__name__.lower(),
            name=name,
            comments=comments,
            line=node.lineno - 1,
            col_offset=col_offset,
            end_col_offset=end_col_offset,
            is_reserved=is_reserved,
            body=body,
            function_start_line=function_start_line,
            function_end_line=function_end_line,
            value=value,
            decorators=decorators,
            calls=calls,
            arguments=arguments
        ))
        self.handle_nested_structures(node)
        self.generic_visit(node)

    def visit_ClassDef(self, node):
        self.in_class = True
        self.generic_node_visit(node)
        self.in_class = False
        self.current_class_type = None

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

        symbol_type = 'function'
        if self.in_class and self.current_class_type:
            symbol_type = f'{self.current_class_type}_method'

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
            arguments=arguments
        ))

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

    def visit_FunctionBody(self, body, calls):
        for statement in body:
            if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call):
                call = ast.get_source_segment(self.source_code, statement)
                calls.append(call)
            self.generic_visit(statement)

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
                
                symbol_type = 'assignment'
                if self.in_class and self.current_class_type:
                    symbol_type = f'{self.current_class_type}_field'
                
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

    def visit_Dict(self, node):
        comments = self.get_related_comments(node)
        for parent in ast.walk(node):
            if isinstance(parent, ast.Assign):
                targets = [t.id for t in parent.targets if isinstance(t, ast.Name)]
                if targets:
                    name = targets[0]
                    self.symbols.append(self._create_symbol_dict(
                        type='dictionary',
                        name=name,
                        comments=comments,
                        line=node.lineno - 1,
                        col_offset=node.col_offset,
                        end_col_offset=node.end_col_offset if hasattr(node, 'end_col_offset') else None,
                        is_reserved=False,
                        value=ast.get_source_segment(self.source_code, node)
                    ))
        self.generic_visit(node)

    def visit_List(self, node):
        comments = self.get_related_comments(node)
        for parent in ast.walk(node):
            if isinstance(parent, ast.Assign):
                targets = [t.id for t in parent.targets if isinstance(t, ast.Name)]
                if targets:
                    name = targets[0]
                    self.symbols.append(self._create_symbol_dict(
                        type='list',
                        name=name,
                        comments=comments,
                        line=node.lineno - 1,
                        col_offset=node.col_offset,
                        end_col_offset=node.end_col_offset if hasattr(node, 'end_col_offset') else None,
                        is_reserved=False,
                        value=ast.get_source_segment(self.source_code, node)
                    ))
        self.generic_visit(node)

    def visit_Return(self, node):
        comments = self.get_related_comments(node)
        if comments:
            self.symbols.append(self._create_symbol_dict(
                type='return',
                name=None,
                comments=comments,
                line=node.lineno - 1,
                col_offset=node.col_offset if node.value else None,
                end_col_offset=node.col_offset + len(ast.get_source_segment(self.source_code, node.value)) if node.value else None,
                is_reserved=False,
                value=ast.get_source_segment(self.source_code, node.value) if node.value else None
            ))
        self.generic_visit(node)

    def visit_For(self, node):
        comments = self.get_related_comments(node)
        target = None
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

        self.symbols.append(self._create_symbol_dict(
            type='for_loop',
            name=target,
            comments=comments,
            line=node.lineno - 1,
            col_offset=node.col_offset,
            end_col_offset=node.end_col_offset if hasattr(node, 'end_col_offset') else None,
            is_reserved=False,
            body=ast.get_source_segment(self.source_code, node),
            target_positions=target_positions
        ))
        self.generic_visit(node)



    def handle_nested_structures(self, node):
        for inner_node in ast.iter_child_nodes(node):
            if isinstance(inner_node, ast.Assign):
                self.handle_assignment(inner_node, node)
            elif isinstance(inner_node, (ast.If, ast.For, ast.While, ast.Try)):
                self.generic_visit(inner_node)  # Further drill down to catch any deeper nested comments

    def handle_assignment(self, node, parent_node):
        comments = self.get_related_comments(node)
        for target in node.targets:
            if isinstance(target, ast.Name):
                value_source = ast.get_source_segment(self.source_code, node.value)
                self.symbols.append(self._create_symbol_dict(
                    type='assignment',
                    name=target.id,
                    comments=comments,
                    line=node.lineno - 1,
                    col_offset=target.col_offset,
                    end_col_offset=target.col_offset + len(target.id),
                    is_reserved=False,
                    value=value_source
                ))
                
    def handle_dictionary(self, node, parent):
        comments = self.get_related_comments(node)
        key_and_value_pairs = []
        for key, value in zip(node.keys, node.values):
            if isinstance(key, ast.Constant):
                key_start = (key.lineno - 1, key.col_offset)
                key_end = (key.end_lineno - 1, key.end_col_offset) if hasattr(key, 'end_lineno') else (
                    key.lineno - 1, key.col_offset + len(str(key.value))
                )
                value_start = (value.lineno - 1, value.col_offset) if hasattr(value, 'lineno') else None
                value_end = (value.end_lineno - 1, value.end_col_offset) if hasattr(value, 'end_lineno') else None

                key_and_value_pairs.append({
                    'key': key.value,
                    'key_start': key_start,
                    'key_end': key_end,
                    'value': ast.get_source_segment(self.source_code, value) if not isinstance(value, ast.Constant) else value.value,
                    'value_start': value_start,
                    'value_end': value_end
                })

        name = parent.arg if hasattr(parent, 'arg') else parent.targets[0].id if hasattr(parent, 'targets') and isinstance(parent.targets[0], ast.Name) else None

        self.symbols.append(self._create_symbol_dict(
            type='dictionary',
            name=name,
            comments=comments,
            line=node.lineno - 1,
            col_offset=node.col_offset,
            end_col_offset=node.end_col_offset if hasattr(node, 'end_col_offset') else None,
            is_reserved=False,
            value=ast.get_source_segment(self.source_code, node),
            key_and_value_pairs=key_and_value_pairs
        ))

    def parse_code(self) -> Dict[str, Any]:
        LOGGER.info("Running parser...")
        try:
            self.get_comments()
            tree = ast.parse(self.source_code)
            self.visit(tree)
            url_visitor = DjangoURLPatternVisitor()
            url_visitor.visit(tree)
            self.url_patterns = url_visitor.url_patterns
            for pattern in self.url_patterns:
                self.symbols.append(self._create_symbol_dict(
                    type='django_url_pattern',
                    name=pattern['name'] or pattern['route'] or '',
                    comments=[],
                    line=pattern['line'] - 1,
                    col_offset=pattern['col'],
                    end_col_offset=pattern['col'] + len(pattern['type']),
                    is_reserved=False,
                    value=str(pattern)
                ))
            LOGGER.info(f"Parsing complete. Found {len(self.symbols)} symbols.")
        except (SyntaxError, IndentationError) as e:
            # djangoly-ignore: we're not worried about syntax errors triggered by the user's code
            LOGGER.error(f"Syntax error in code: {str(e)}")
        except Exception as e:
            # djangoly-ignore: we're not worried about runtime errors triggered by the user's code
            LOGGER.error(f"Unexpected error during parsing: {str(e)}")
        return {
            "symbols": self.symbols,
            "security_issues": self.security_issues,
        }

def main():
    input_code = sys.stdin.read()
    LOGGER.info("Analyzer initialized")
    analyzer = Analyzer(input_code)
    parsed_code = analyzer.parse_code()
    print(json.dumps(parsed_code, default=serialize_file_data))
    LOGGER.info("Finished processing and outputting results")

if __name__ == "__main__":
    main()
