import ast
import sys

from ast_parser import Analyzer

class DjangoAnalyzer(Analyzer):
    def visit_ClassDef(self, node):
        class_type = None
        if any(self._is_django_model(base) for base in node.bases):
            class_type = 'django_model'
        elif any(self._is_django_serializer(base) for base in node.bases):
            class_type = 'django_serializer'
        elif any(self._is_django_view(base) for base in node.bases):
            class_type = 'django_view'
        elif any(self._is_django_testcase(base) for base in node.bases):
            class_type = 'django_testcase'

        if class_type:
            self.symbols.append({
                'type': class_type,
                'name': node.name,
                'line': node.lineno - 1,
                'col_offset': node.col_offset,
                'end_col_offset': node.col_offset + len(node.name)
            })
            self.current_class_type = class_type
        else:
            self.current_class_type = None
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        if self.current_class_type in ['django_model', 'django_serializer', 'django_view', 'django_testcase']:
            self.symbols.append({
                'type': f'{self.current_class_type}_method',
                'name': node.name,
                'line': node.lineno - 1,
                'col_offset': node.col_offset,
                'end_col_offset': node.col_offset + len(node.name)
            })
        else:
            super().visit_FunctionDef(node)

    def visit_Assign(self, node):
        if self.current_class_type == 'django_model':
            for target in node.targets:
                if isinstance(target, ast.Name):
                    value_source = ast.get_source_segment(self.source_code, node.value)
                    self.symbols.append({
                        'type': 'django_model_field',
                        'name': target.id,
                        'value': value_source,
                        'line': node.lineno - 1,
                        'col_offset': target.col_offset,
                        'end_col_offset': target.col_offset + len(target.id)
                    })
        elif self.current_class_type == 'django_serializer':
            for target in node.targets:
                if isinstance(target, ast.Name):
                    value_source = ast.get_source_segment(self.source_code, node.value)
                    self.symbols.append({
                        'type': 'django_serializer_field',
                        'name': target.id,
                        'value': value_source,
                        'line': node.lineno - 1,
                        'col_offset': target.col_offset,
                        'end_col_offset': target.col_offset + len(target.id)
                    })
        elif self.current_class_type == 'django_view':
            # Views typically don't have field assignments that need to be captured
            pass
        elif self.current_class_type == 'django_testcase':
            # TODO: Handle specific assignments within test cases if needed
            pass
        else:
            super().visit_Assign(node)

        # Always call generic_visit to ensure we visit all nodes
        self.generic_visit(node)


    def _is_django_model(self, node):
        if isinstance(node, ast.Name):
            if node.id == 'Model' or node.id.endswith('Model'):  # Simple heuristic
                return True
        elif isinstance(node, ast.Attribute):  # For namespaced models like `models.Model`
            if node.attr == 'Model' or node.attr.endswith('Model'):
                return True
        return False
    
    def _is_django_serializer(self, node):
        if isinstance(node, ast.Name):
            if node.id == 'Serializer' or node.id.endswith('Serializer'):
                return True
        elif isinstance(node, ast.Attribute):
            if node.attr == 'Serializer' or 'Serializer' in node.attr:
                return True
        return False
    
    def _is_django_view(self, node):
        if isinstance(node, ast.Name):
            if node.id == 'View' or node.id.endswith('View'):
                return True
        elif isinstance(node, ast.Attribute):
            if node.attr == 'View' or node.attr.endswith('View'):
                return True
        return False
    
    def _is_django_testcase(self, node):
        if isinstance(node, ast.Name):
            if node.id == 'TestCase' or node.id.endswith('TestCase'):
                return True
        elif isinstance(node, ast.Attribute):
            if node.attr == 'TestCase':
                return True
        return False
    
    def _is_django_test_name(self, node):
        if isinstance(node, ast.Name):
            if node.id == 'test' or node.id.startswith('test'):
                return True
        return False
    


def main():
    input_code = sys.stdin.read()
    analyzer = DjangoAnalyzer(input_code)
    print(analyzer.parse_code())

if __name__ == "__main__":
    main()