import ast
from typing import Optional

from constants import QUERY_METHODS, BULK_METHODS

class QueryAnalyzer:
    def __init__(self, queryset_tracker):
        self.queryset_tracker = queryset_tracker

    def is_potential_n_plus_one(self, node: ast.AST) -> bool:
        if isinstance(node, ast.Call):
            return self._is_query_method(node)
        elif isinstance(node, ast.Attribute):
            return self._is_deep_attribute_access(node)
        return False

    def _is_query_method(self, node: ast.Call) -> bool:
        if isinstance(node.func, ast.Attribute):
            return node.func.attr in QUERY_METHODS
        elif isinstance(node.func, ast.Name):
            return node.func.id in QUERY_METHODS
        return False

    def _is_deep_attribute_access(self, node: ast.Attribute) -> bool:
        full_path = self.get_full_attribute_path(node)
        return len(full_path.split('.')) > 2

    def extract_related_field(self, node: ast.AST) -> str:
        if isinstance(node, ast.Call):
            node = node.func

        if isinstance(node, ast.Attribute):
            attrs = []
            current = node
            while isinstance(current, ast.Attribute):
                if current.attr not in ('objects', 'all', 'filter', 'exclude', 'select_related', 'prefetch_related', 'get'):
                    attrs.append(current.attr)
                current = current.value

            attrs.reverse()
            return '.'.join(attrs) if attrs else ''

        return ''

    def get_query_type(self, node: ast.AST) -> str:
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in QUERY_METHODS:
                return "read"
            elif node.func.attr in BULK_METHODS:
                return "bulk"
        elif isinstance(node, ast.Attribute):
            if self._is_deep_attribute_access(node):
                return "attribute_access"
        return "unknown"

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
    def get_base_model(node: ast.AST) -> Optional[str]:
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return QueryAnalyzer.get_base_model(node.value)
        return None