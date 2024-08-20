import ast
from typing import List


class ASTVisitor:
    @staticmethod
    def find_loops(node: ast.AST) -> List[ast.AST]:
        loops = []
        for loop_node in ast.walk(node):
            if isinstance(loop_node, (ast.For, ast.While, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
                loops.append(loop_node)
        return loops

    @staticmethod
    def get_full_attribute_path(node: ast.AST) -> str:
        parts = []
        current = node
        while isinstance(current, ast.Attribute):
            parts.append(current.attr)
            current = current.value
        if isinstance(current, ast.Name):
            parts.append(current.id)
        return '.'.join(reversed(parts))

    @staticmethod
    def get_base_model(node: ast.AST) -> str:
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return ASTVisitor.get_base_model(node.value)
        return ""