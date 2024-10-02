import ast

from djangoly.core.utils.log import LOGGER
from .constants import ExceptionHandlingIssue


class ExceptionHandlingCheckService:
    def __init__(self, source_code: str):
        self.source_code = source_code
        self.tree = None 

    def parse_source_code(self):
        """Parse the source code into an AST, catching syntax errors gracefully."""
        try:
            self.tree = ast.parse(self.source_code)
        except SyntaxError as e:
            LOGGER.error(f"Syntax error while parsing source code: {e}")
            self.tree = None

    def check_for_exception_handling(self, node):
        """Check if exception handling is present in the given node."""
        for current_node in ast.walk(node):
            if isinstance(current_node, ast.Try):
                return True
        return False

    def run_check(self, node: ast.AST):
        """Run the exception handling check on the given AST node."""
        try:
            if self.tree is None:
                self.parse_source_code()
            
            if self.tree is None:
                return None

            if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
                has_exception_handling = self.check_for_exception_handling(node)
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
