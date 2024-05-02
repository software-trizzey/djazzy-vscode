import ast
import json
import sys

class Analyzer(ast.NodeVisitor):
    def __init__(self, source_code):
        self.source_code = source_code
        self.symbols = []

    def visit_ClassDef(self, node):
        self.symbols.append({
            'type': 'class',
            'name': node.name,
            'value': None,
            'line': node.lineno - 1,
            'col_offset': node.col_offset,
            'end_col_offset': node.col_offset + len(node.name)
        })
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        self.symbols.append({
            'type': 'function',
            'name': node.name,
            'value': None,
            'line': node.lineno - 1,
            'col_offset': node.col_offset,
            'end_col_offset': node.col_offset + len(node.name)
        })
        self.generic_visit(node)

    def visit_Assign(self, node):
        for target in node.targets:
            if isinstance(target, ast.Name):
                value_source = ast.get_source_segment(self.source_code, node.value)
                self.symbols.append({
                    'type': 'variable',
                    'name': target.id,
                    'value': value_source,
                    'line': node.lineno - 1,
                    'col_offset': target.col_offset,
                    'end_col_offset': target.col_offset + len(target.id)
                })
        self.generic_visit(node)

    def parse_code(self):
        tree = ast.parse(self.source_code)
        self.visit(tree)
        return json.dumps(self.symbols)

def main():
    input_code = sys.stdin.read()
    analyzer = Analyzer(input_code)
    print(analyzer.parse_code())

if __name__ == "__main__":
    main()
