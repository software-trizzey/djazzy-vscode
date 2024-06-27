import ast
import keyword
import builtins
import json
import sys
import tokenize
from io import StringIO

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
                                'args': [],
                                'line': elt.lineno,
                                'col': elt.col_offset
                            }
                            for arg in elt.args:
                                if isinstance(arg, ast.Str):
                                    pattern['args'].append(arg.s)
                                elif isinstance(arg, ast.Name):
                                    pattern['args'].append(arg.id)
                            self.url_patterns.append(pattern)

class Analyzer(ast.NodeVisitor):
    def __init__(self, source_code):
        self.source_code = source_code
        self.symbols = []
        self.comments = []
        self.pending_comments = []
        self.url_patterns = []

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

    def _create_symbol_dict(
            self,
            type,
            name,
            comments,
            line,
            col_offset,
            end_col_offset,
            is_reserved,
            value=None,
            body=None,
            function_start_line=None,
            function_end_line=None,
            key_and_value_pairs=None,
            decorators=None,
            calls=None,
            arguments=None,
            target_positions=None
        ):
        """
        Creates a dictionary representation of a symbol.
        """
        symbol = {
            'type': type,
            'name': name,
            'leading_comments': comments,
            'line': line,
            'col_offset': col_offset,
            'end_col_offset': end_col_offset,
            'is_reserved': is_reserved,
        }
        if value:
            symbol['value'] = value
        if body:
            symbol['body'] = body
        if function_start_line is not None:
            symbol['function_start_line'] = function_start_line
        if function_end_line is not None:
            symbol['function_end_line'] = function_end_line
        if key_and_value_pairs:
            symbol['key_and_value_pairs'] = key_and_value_pairs
        if decorators:
            symbol['decorators'] = decorators
        if calls:
            symbol['calls'] = calls
        if arguments:
            symbol['arguments'] = arguments
        if target_positions:
            symbol['target_positions'] = target_positions
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

        if isinstance(node, ast.FunctionDef):
            col_offset += len('def ')
            function_start_line = node.body[0].lineno
            function_end_line = node.body[-1].end_lineno if hasattr(node.body[-1], 'end_lineno') else node.body[-1].lineno
            is_reserved = DJANGO_IGNORE_FUNCTIONS.get(node.name, False) or self.is_python_reserved(node.name)
            body = ast.get_source_segment(self.source_code, node)
            arguments = self.extract_arguments(node.args)
            self.visit_FunctionBody(node.body, calls)
        elif isinstance(node, ast.ClassDef):
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
        self.generic_node_visit(node)

    def visit_FunctionDef(self, node):
        self.generic_node_visit(node)

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
        self.generic_node_visit(node)

        if isinstance(node.value, ast.Dict):
            self.handle_dictionary(node.value, node)

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

    def parse_code(self):
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
                    name=pattern['args'][0] if pattern['args'] else '',
                    comments=[],
                    line=pattern['line'] - 1,
                    col_offset=pattern['col'],
                    end_col_offset=pattern['col'] + len(pattern['type']),
                    is_reserved=False,
                    value=str(pattern)
                ))

        except (SyntaxError, IndentationError) as e:
            # @rome-ignore: we're not worried about syntax errors triggered by the user's code
            pass
        except Exception as e:
            # @rome-ignore: we're not worried about runtime errors triggered by the user's code
            pass
        return json.dumps(self.symbols, default=serialize_file_data)

def main():
    input_code = sys.stdin.read()
    analyzer = Analyzer(input_code)
    print(analyzer.parse_code())

if __name__ == "__main__":
    main()
