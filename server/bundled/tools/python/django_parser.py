import ast
import sys
from ast_parser import Analyzer

DJANGO_COMPONENTS = {
    'model': ['Model', 'BaseModel'],
    'serializer': ['Serializer', 'BaseSerializer'],
    'view': ['View', 'BaseView'],
    'testcase': ['TestCase', 'BaseTestCase']
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
                class_type, node.name, comments, node.lineno - 1, node.col_offset
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
            self.symbols.append(self._create_symbol_dict(
                f'{self.current_class_type}_method', node.name, comments, node.lineno - 1, node.col_offset
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
                        f'{self.current_class_type}_field', target.id, comments, node.lineno - 1, target.col_offset, value_source
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
        """
        Checks if a given name is a Django component.
        """
        return any(name in components for components in DJANGO_COMPONENTS.values())

    def _get_component_type(self, name):
        """
        Returns the type of Django component (model, serializer, etc.).
        """
        for component, names in DJANGO_COMPONENTS.items():
            if name in names:
                return f'django_{component}'
        return None

    def _create_symbol_dict(self, type, name, comments, line, col_offset, value=None):
        """
        Creates a dictionary representation of a symbol.
        """
        symbol = {
            'type': type,
            'name': name,
            'leading_comments': comments,
            'line': line,
            'col_offset': col_offset,
            'end_col_offset': col_offset + len(name)
        }
        if value:
            symbol['value'] = value
        return symbol

def main():
    input_code = sys.stdin.read()
    analyzer = DjangoAnalyzer(input_code)
    print(analyzer.parse_code())

if __name__ == "__main__":
    main()
