import ast
import sys
from ast_parser import Analyzer

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

class DjangoAnalyzer(Analyzer):
    """
    Custom AST Analyzer for Django files.
    Identifies Django-specific components and methods.
    """
    current_class_type = None

    def visit_ClassDef(self, node):
        """
        Visits class definitions and identifies Django components.
        """
        class_type = self._get_django_class_type(node.bases)

        if class_type:
            comments = self.get_related_comments(node)
            self.symbols.append(self._create_symbol_dict(
                type=class_type,
                name=node.name,
                comments=comments,
                line=node.lineno - 1,
                col_offset=node.col_offset,
                end_col_offset=node.col_offset + len(node.name),
                is_reserved=False
            ))
            self.current_class_type = class_type
        else:
            self.current_class_type = None

        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        """
        Visits function definitions and identifies Django methods.
        """
        if self.current_class_type:
            comments = self.get_related_comments(node)
            is_reserved = DJANGO_IGNORE_FUNCTIONS.get(node.name, False) or self.is_python_reserved(node.name)
            function_start_line = node.lineno - 1
            function_start_col = node.col_offset
            
            # Find the last non-empty line in the function body
            function_end_line = node.body[-1].end_lineno - 1 if hasattr(node.body[-1], 'end_lineno') else node.body[-1].lineno - 1
            function_end_col = node.body[-1].end_col_offset if hasattr(node.body[-1], 'end_col_offset') else len(self.source_code.splitlines()[function_end_line])
            
            # Handle empty functions
            if not node.body:
                function_end_line = function_start_line
                function_end_col = function_start_col + len('def ' + node.name + '():')

            body = self.get_function_body(node)
            decorators = [ast.get_source_segment(self.source_code, decorator) for decorator in node.decorator_list]
            calls = []
            arguments = self.extract_arguments(node.args)
            
            self.visit_FunctionBody(node.body, calls)

            self.symbols.append(self._create_symbol_dict(
                type=f'{self.current_class_type}_method',
                name=node.name,
                comments=comments,
                line=function_start_line,
                col_offset=function_start_col,
                end_col_offset=function_end_col,
                is_reserved=is_reserved,
                body=body,
                function_start_line=function_start_line,
                function_end_line=function_end_line,
                function_start_col=function_start_col,
                function_end_col=function_end_col,
                decorators=decorators,
                calls=calls,
                arguments=arguments
            ))
            self.handle_nested_structures(node)
        else:
            super().visit_FunctionDef(node)

    def visit_Assign(self, node):
        """
        Visits assignment statements and identifies fields in Django components.
        """
        if self.current_class_type:
            for target in node.targets:
                if isinstance(target, ast.Name):
                    value_source = ast.get_source_segment(self.source_code, node.value)
                    comments = self.get_related_comments(node)
                    self.symbols.append(self._create_symbol_dict(
                        type=f'{self.current_class_type}_field',
                        name=target.id,
                        comments=comments,
                        line=node.lineno - 1,
                        col_offset=target.col_offset,
                        end_col_offset=target.col_offset + len(target.id),
                        is_reserved=False,
                        value=value_source
                    ))
        else:
            super().visit_Assign(node)
        self.generic_visit(node)

    def _get_django_class_type(self, bases):
        """
        Determines the type of Django component based on base classes.
        """
        for base in bases:
            if isinstance(base, ast.Name) and self._is_django_component(base.id):
                return self._get_component_type(base.id)
            elif isinstance(base, ast.Attribute) and self._is_django_component(base.attr):
                return self._get_component_type(base.attr)
        return None

    def _is_django_component(self, name):
        return any(name in components for components in DJANGO_COMPONENTS.values())

    def _get_component_type(self, name):
        """
        Returns the type of Django component (model, serializer, etc.).
        """
        for component, names in DJANGO_COMPONENTS.items():
            if name in names:
                return f'django_{component}'
        return None


def main():
    input_code = sys.stdin.read()
    analyzer = DjangoAnalyzer(input_code)
    print(analyzer.parse_code())

if __name__ == "__main__":
    main()
