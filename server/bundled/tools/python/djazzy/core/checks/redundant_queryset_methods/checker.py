import ast

from djazzy.core.checks.base import BaseCheckService
from djazzy.core.lib.log import LOGGER
from djazzy.core.lib.rules import RuleCode
from .constants import RedundantQueryMethodIssue


class RedundantQueryMethodCheckService(BaseCheckService):
    def __init__(self, source_code: str):
        super().__init__()
        self.source_code = source_code
        self.lines = self.source_code.splitlines()

    def run_check(self, node: ast.AST) -> RedundantQueryMethodIssue:
        """Run the redundant query method check on the given AST node."""
        if not self.is_rule_enabled(RuleCode.CDQ06.value):
            LOGGER.debug("Skipping redundant query method check as the rule is disabled")
            return None

        LOGGER.debug("Running redundant query method check")
        try:
            for current_node in ast.walk(node):
                if isinstance(current_node, ast.Call):
                    method_chain = self._get_method_chain(current_node)
                    if self._is_redundant_queryset_chain(method_chain):
                        original_query = self.lines[current_node.lineno - 1]
                        simplified_chain = self._get_simplified_chain(method_chain)
                        fixed_queryset = self._get_fixed_queryset(original_query, method_chain, simplified_chain)

                        issue = RedundantQueryMethodIssue(
                            method_chain=".".join(reversed(method_chain)),
                            simplified_chain=simplified_chain,
                            lineno=current_node.lineno,
                            col_offset=current_node.col_offset,
                            end_col_offset=self._get_end_col_offset(current_node),
                            fixed_queryset=fixed_queryset,
                        )
                        return issue
            return None
        except Exception as e:
            LOGGER.warning(f"Error while running redundant query method check: {e}")
            return None

    def _get_method_chain(self, node):
        """Recursively get the method chain from a call node."""
        chain = []
        while isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            chain.append(node.func.attr)
            node = node.func.value
        return chain

    def _is_redundant_queryset_chain(self, method_chain):
        """Check if the method chain contains redundant queryset patterns."""
        return method_chain in [
            ['count', 'all'],
            ['all', 'filter'],
            ['filter', 'all'],
        ]

    def _get_end_col_offset(self, node):
        """Get the end column offset of the method chain."""
        if hasattr(node, 'end_col_offset'):
            return node.end_col_offset
        source_line = self.source_code.splitlines()[node.lineno - 1]
        return node.col_offset + len(source_line) - node.col_offset

    def _get_fixed_queryset(self, original_query, method_chain, simplified_chain):
        """
        Replace the redundant part of the query (method_chain) with the simplified_chain
        and return the fixed queryset.
        
        Note: The method_chain is reversed, so we will replace the first instance of the redundant method
        """
        fixed_query = original_query.replace(".".join(method_chain), simplified_chain, 1)
        return fixed_query

    def _get_simplified_chain(self, method_chain):
        """Get the simplified method chain based on the redundant pattern."""
        if method_chain == ['count', 'all']:
            return 'count()'
        if method_chain == ['all', 'filter'] or method_chain == ['filter', 'all']:
            return 'filter()'
        return None
