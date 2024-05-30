import ast
import keyword
import builtins
import json
import sys
import tokenize
from io import StringIO



class Analyzer(ast.NodeVisitor):
    def __init__(self, source_code):
        self.source_code = source_code
        self.symbols = []
        self.comments = []
        self.pending_comments = []

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

    def generic_node_visit(self, node):
        comments = self.get_related_comments(node)
        name = getattr(node, 'name', None)
        col_offset = node.col_offset
        function_start_line = node.lineno
        function_end_line = node.lineno
        is_reserved = False
        if isinstance(node, ast.FunctionDef):
            col_offset += len('def ')
            function_start_line = node.body[0].lineno
            function_end_line = node.body[-1].end_lineno if hasattr(node.body[-1], 'end_lineno') else node.body[-1].lineno
            is_reserved = self.is_python_reserved(node.name)
        elif isinstance(node, ast.ClassDef):
            col_offset += len('class ')
        self.symbols.append({
            'type': type(node).__name__.lower(),
            'name': name,
            'leading_comments': comments,
            'line': node.lineno - 1,
            'col_offset': col_offset,
            'end_col_offset': col_offset + (len(name) if name else 0),
            'body': ast.get_source_segment(self.source_code, node) if isinstance(node, ast.FunctionDef) else None,
            'function_start_line': function_start_line,
            'function_end_line': function_end_line,
            'is_reserved': is_reserved
        })
        self.handle_nested_structures(node)
        self.generic_visit(node)

    def visit_ClassDef(self, node):
        self.generic_node_visit(node)

    def visit_FunctionDef(self, node):
        self.generic_node_visit(node)

    def visit_Assign(self, node):
        for target in node.targets:
            if isinstance(target, ast.Name):
                value_source = ast.get_source_segment(self.source_code, node.value)
                comments = self.get_related_comments(node)
                self.symbols.append({
                    'type': 'variable',
                    'name': target.id,
                    'leading_comments': comments,
                    'value': value_source,
                    'line': node.lineno - 1,
                    'col_offset': target.col_offset,
                    'end_col_offset': target.col_offset + len(target.id)
                })
        self.generic_visit(node)

    def visit_Dict(self, node):
        comments = self.get_related_comments(node)
        self.symbols.append({
            'type': 'dictionary',
            'value': ast.get_source_segment(self.source_code, node),
            'line': node.lineno - 1,
            'col_offset': node.col_offset,
            'end_col_offset': node.end_col_offset if hasattr(node, 'end_col_offset') else None,
            'leading_comments': comments
        })
        self.generic_visit(node)

    def visit_List(self, node):
        comments = self.get_related_comments(node)
        self.symbols.append({
            'type': 'list',
            'value': ast.get_source_segment(self.source_code, node),
            'line': node.lineno - 1,
            'col_offset': node.col_offset,
            'end_col_offset': node.end_col_offset if hasattr(node, 'end_col_offset') else None,
            'leading_comments': comments
        })
        self.generic_visit(node)

    def visit_Return(self, node):
        comments = self.get_related_comments(node)
        if comments:
            self.symbols.append({
                'type': 'return',
                'value': ast.get_source_segment(self.source_code, node.value) if node.value else None,
                'line': node.lineno - 1,
                'col_offset': node.col_offset if node.value else None,
                'end_col_offset': node.col_offset + len(ast.get_source_segment(self.source_code, node.value)) if node.value else None,
                'leading_comments': comments
            })
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
                self.symbols.append({
                    'type': 'assignment',
                    'name': target.id,
                    'leading_comments': comments,
                    'value': value_source,
                    'line': node.lineno - 1,
                    'col_offset': target.col_offset,
                    'end_col_offset': target.col_offset + len(target.id)
                })

    def parse_code(self):
        self.get_comments()
        tree = ast.parse(self.source_code)
        self.visit(tree)
        return json.dumps(self.symbols)

def main():
    input_code = sys.stdin.read()
    analyzer = Analyzer(input_code)
    print(analyzer.parse_code())

if __name__ == "__main__":
    main()
