import ast
from typing import Optional

from constants import QUERY_METHODS, BULK_METHODS
from log import LOGGER

class QueryAnalyzer:
    def __init__(self, queryset_tracker):
        self.queryset_tracker = queryset_tracker

    def _is_query_dependent_on_var(self, node: ast.Call, var_name: str) -> bool:
        """Check if the query uses the loop variable."""
        LOGGER.debug(f"Checking if query {ast.unparse(node)} depends on variable '{var_name}'")
        for arg in node.args:
            if self._node_contains_var(arg, var_name):
                LOGGER.debug(f"Query depends on '{var_name}' in argument: {ast.unparse(arg)}")
                return True
        for keyword in node.keywords:
            if self._node_contains_var(keyword.value, var_name):
                LOGGER.debug(f"Query depends on '{var_name}' in keyword argument: {keyword.arg}")
                return True
        LOGGER.debug(f"Query does not depend on '{var_name}'")
        return False

    def _node_contains_var(self, node: ast.AST, var_name: str) -> bool:
        """Recursively check if a node or its children contain the variable."""
        if isinstance(node, ast.Name) and node.id == var_name:
            LOGGER.debug(f"Found variable '{var_name}' in node {ast.unparse(node)}")
            return True
        for child in ast.iter_child_nodes(node):
            if self._node_contains_var(child, var_name):
                return True
        return False

    def _get_loop_variable(self, loop_node: ast.AST) -> Optional[str]:
        """Extract the loop variable name."""
        LOGGER.debug(f"Extracting loop variable from {type(loop_node).__name__}")
        if isinstance(loop_node, ast.For):
            if isinstance(loop_node.target, ast.Name):
                LOGGER.debug(f"Found loop variable: {loop_node.target.id}")
                return loop_node.target.id
            elif isinstance(loop_node.target, ast.Tuple):
                for elt in loop_node.target.elts:
                    if isinstance(elt, ast.Name):
                        LOGGER.debug(f"Found loop variable (from tuple): {elt.id}")
                        return elt.id
        elif isinstance(loop_node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
            for generator in loop_node.generators:
                if isinstance(generator.target, ast.Name):
                    LOGGER.debug(f"Found comprehension variable: {generator.target.id}")
                    return generator.target.id
        LOGGER.debug("No loop variable found")
        return None

    def is_potential_n_plus_one(self, node: ast.AST, parent_loop: ast.AST) -> bool:
        """Check if a node represents a potential N+1 query."""
        LOGGER.debug(f"Checking if node {type(node).__name__} is a potential N+1 query")
        if isinstance(node, ast.Call):
            if self._is_query_method(node):
                loop_var = self._get_loop_variable(parent_loop)
                if loop_var:
                    is_dependent = self._is_query_dependent_on_var(node, loop_var)
                    LOGGER.debug(f"Query method {'is' if is_dependent else 'is not'} dependent on loop variable '{loop_var}'")
                    return is_dependent
                else:
                    LOGGER.debug("No loop variable found for comparison")
        elif isinstance(node, ast.Attribute):
            is_deep_access = self._is_deep_attribute_access(node)
            LOGGER.debug(f"Attribute {'is' if is_deep_access else 'is not'} a deep access")
            return is_deep_access
        LOGGER.debug("Node is not a potential N+1 query")
        return False

    def _is_query_method(self, node: ast.Call) -> bool:
        """Check if the node represents a query method."""
        if isinstance(node.func, ast.Attribute):
            is_query = node.func.attr in QUERY_METHODS
            LOGGER.debug(f"Method {node.func.attr} {'is' if is_query else 'is not'} a query method")
            return is_query
        elif isinstance(node.func, ast.Name):
            is_query = node.func.id in QUERY_METHODS
            LOGGER.debug(f"Function {node.func.id} {'is' if is_query else 'is not'} a query method")
            return is_query
        LOGGER.debug("Node is not a query method")
        return False

    def _is_deep_attribute_access(self, node: ast.Attribute) -> bool:
        """Check if the attribute access is deep (more than two levels)."""
        full_path = self.get_full_attribute_path(node)
        is_deep = len(full_path.split('.')) > 2
        LOGGER.debug(f"Attribute path '{full_path}' {'is' if is_deep else 'is not'} a deep access")
        return is_deep

    def extract_related_field(self, node: ast.AST) -> str:
        LOGGER.debug(f"Extracting related field from node: {type(node).__name__}")
        if isinstance(node, ast.Call):
            LOGGER.debug("Node is a Call, extracting from func attribute")
            node = node.func

        if isinstance(node, ast.Attribute):
            attrs = []
            current = node
            while isinstance(current, ast.Attribute):
                LOGGER.debug(f"Examining attribute: {current.attr}")
                if current.attr not in ('objects', 'all', 'filter', 'exclude', 'select_related', 'prefetch_related', 'get'):
                    LOGGER.debug(f"Adding attribute to list: {current.attr}")
                    attrs.append(current.attr)
                current = current.value

            attrs.reverse()
            result = '.'.join(attrs) if attrs else ''
            LOGGER.info(f"Extracted related field: {result or 'None'}")
            return result

        LOGGER.debug("No related field extracted")
        return ''

    def get_query_type(self, node: ast.AST) -> str:
        LOGGER.debug(f"Determining query type for node: {type(node).__name__}")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            LOGGER.debug(f"Examining Call node with attribute: {node.func.attr}")
            if node.func.attr in QUERY_METHODS:
                LOGGER.info(f"Query type identified as read for method: {node.func.attr}")
                return "read"
            elif node.func.attr in BULK_METHODS:
                LOGGER.info(f"Query type identified as bulk for method: {node.func.attr}")
                return "bulk"
        elif isinstance(node, ast.Attribute):
            LOGGER.debug(f"Examining Attribute node: {node.attr}")
            if self._is_deep_attribute_access(node):
                LOGGER.info("Query type identified as attribute_access")
                return "attribute_access"
        LOGGER.info("Query type is unknown")
        return "unknown"

    @staticmethod
    def get_full_attribute_path(node: ast.AST) -> str:
        """Get the full attribute path as a string."""
        parts = []
        current = node
        while isinstance(current, ast.Attribute):
            parts.append(current.attr)
            current = current.value
        if isinstance(current, ast.Name):
            parts.append(current.id)
        full_path = '.'.join(reversed(parts))
        LOGGER.debug(f"Full attribute path: {full_path}")
        return full_path

    @staticmethod
    def get_base_model(node: ast.AST) -> Optional[str]:
        """Get the base model name from the node."""
        if isinstance(node, ast.Name):
            LOGGER.debug(f"Base model (from Name): {node.id}")
            return node.id
        elif isinstance(node, ast.Attribute):
            if isinstance(node.value, ast.Call):
                base_model = QueryAnalyzer.get_base_model(node.value.func)
                LOGGER.debug(f"Base model (from Attribute with Call): {base_model}")
                return base_model
            base_model = QueryAnalyzer.get_base_model(node.value)
            LOGGER.debug(f"Base model (from Attribute): {base_model}")
            return base_model
        elif isinstance(node, ast.Call):
            base_model = QueryAnalyzer.get_base_model(node.func)
            LOGGER.debug(f"Base model (from Call): {base_model}")
            return base_model
        LOGGER.debug("No base model found")
        return None