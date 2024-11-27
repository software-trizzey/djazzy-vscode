import ast

from djangoly.core.checks.base import BaseCheckService
from djangoly.core.lib.log import LOGGER
from djangoly.core.lib.rules import RuleCode
from .constants import ExceptionHandlingIssue


class ExceptionHandlingCheckService(BaseCheckService):
    def __init__(self, source_code: str):
        super().__init__()
        self.source_code = source_code
        self.tree = None 

    def run_check(self, node: ast.AST):
        """Run the exception handling check on the given AST node."""
        if not self.is_rule_enabled(RuleCode.CDQ01.value):
            LOGGER.debug("Skipping exception handling check as the rule is disabled")
            return None
        
        LOGGER.debug("Running exception handling check")

        try:
            if self.tree is None:
                self._parse_source_code()
            
            if self.tree is None:
                return None

            if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
                has_exception_handling = self._check_for_exception_handling(node)
                if not has_exception_handling:
                    issue = ExceptionHandlingIssue(
                        view_name=node.name,
                        lineno=node.lineno,
                        col=node.col_offset,
                    )
                    return issue
            return None
        except SyntaxError:
            LOGGER.warning(f"Syntax error while running exception handling check on {node.name}")
            return None
        except Exception:
            LOGGER.warning(f"Error while running exception handling check on {node.name}")
            return None

    def _parse_source_code(self):
        """Parse the source code into an AST, catching syntax errors gracefully."""
        try:
            self.tree = ast.parse(self.source_code)
        except SyntaxError as e:
            LOGGER.error(f"Syntax error while parsing source code: {e}")
            self.tree = None

    def _check_for_exception_handling(self, node):
        """Check if exception handling is present in the given node."""
        for current_node in ast.walk(node):
            if isinstance(current_node, ast.Try):
                return True
        return False