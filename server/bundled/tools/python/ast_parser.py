import ast
import json
import sys
import tokenize
from io import StringIO

class Analyzer(ast.NodeVisitor):
    def __init__(self, source_code):
        self.source_code = source_code
        self.symbols = []
        self.comments = []
        self.last_non_comment_line = 0

    def get_comments(self):
        tokens = tokenize.generate_tokens(StringIO(self.source_code).readline)
        for toke_number, token_value, start, end, _ in tokens:
            if toke_number == tokenize.COMMENT:
                self.comments.append({
                    'type': 'comment',
                    'value': token_value.strip('#').strip(),
                    'line': start[0] - 1,
                    'col_offset': start[1],
                    'end_col_offset': end[1]
                })
            else:
                self.last_non_comment_line = end[0] - 1

    def get_related_comments(self, node):
        # @rome-ignore Find and associate comments that are directly above the node without any blank lines
        related_comments = []
        for comment in reversed(self.comments):
            if comment['line'] == node.lineno - 2:  # The comment is directly above the node
                related_comments.append(comment)
                node.lineno -= 1  # Update lineno to match the next upper line
            elif comment['line'] < node.lineno - 2:
                break  # Stop if there's a line break between comments and the node
        return related_comments[::-1]  # Reverse to maintain original order

    def visit_ClassDef(self, node):
        comments = self.get_related_comments(node)
        self.symbols.append({
            'type': 'class',
            'name': node.name,
            'leading_comments': [comment['value'] for comment in comments],
            'line': node.lineno - 1,
            'col_offset': node.col_offset,
            'end_col_offset': node.col_offset + len(node.name)
        })
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        comments = self.get_related_comments(node)
        self.symbols.append({
            'type': 'function',
            'name': node.name,
            'leading_comments': [comment['value'] for comment in comments],
            'line': node.lineno - 1,
            'col_offset': node.col_offset,
            'end_col_offset': node.col_offset + len(node.name)
        })
        self.generic_visit(node)

    def visit_Assign(self, node):
        for target in node.targets:
            if isinstance(target, ast.Name):
                value_source = ast.get_source_segment(self.source_code, node.value)
                comments = self.get_related_comments(node)
                self.symbols.append({
                    'type': 'variable',
                    'name': target.id,
                    'leading_comments': [comment['value'] for comment in comments],
                    'value': value_source,
                    'line': node.lineno - 1,
                    'col_offset': target.col_offset,
                    'end_col_offset': target.col_offset + len(target.id)
                })
        self.generic_visit(node)

    def parse_code(self):
        self.get_comments()
        tree = ast.parse(self.source_code)
        self.visit(tree)
        return json.dumps({
            'symbols': self.symbols
        })

def main():
    input_code = sys.stdin.read()
    analyzer = Analyzer(input_code)
    print(analyzer.parse_code())

if __name__ == "__main__":
    main()
