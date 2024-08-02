import ast
import sys
import json

from ast_parser import Analyzer, serialize_file_data

DJANGO_COMPONENTS = {
    'model': ['Model', 'BaseModel'],
    'serializer': ['Serializer', 'BaseSerializer'],
    'view': ['View', 'BaseView'],
    'testcase': ['TestCase', 'BaseTestCase']
}

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
}

QUERY_METHODS = {"filter", "all", "get", "exclude", "iterator", "values", "values_list"}

class DjangoAnalyzer(Analyzer):
    def __init__(self, source_code):
        super().__init__(source_code)
        self.current_django_class_type = None

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

def main():
    input_code = sys.stdin.read()
    analyzer = DjangoAnalyzer(input_code)
    parsed_symbols = analyzer.parse_code()
    print(json.dumps(parsed_symbols, default=serialize_file_data))

if __name__ == "__main__":
    main()
