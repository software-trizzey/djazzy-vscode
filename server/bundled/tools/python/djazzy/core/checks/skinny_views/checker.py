import ast

from djazzy.core.checks.base import BaseCheckService
from djazzy.core.lib.log import LOGGER
from djazzy.core.lib.rules import RuleCode

from .scorer import ViewComplexityScorer
from .constants import ComplexityIssue

class ViewComplexityAnalyzer(BaseCheckService):
    def __init__(self, source_code: str, complexity_scorer: ViewComplexityScorer):
        super().__init__()
        self.source_code = source_code
        self.complexity_scorer = complexity_scorer

    def run_complexity_analysis(self, node) -> ComplexityIssue:
        """
        Run complexity analysis on the given view function or class and return issues if detected.
        """
        if not self.is_rule_enabled(RuleCode.CDQ07.value):
            LOGGER.debug("Skipping view complexity analysis as the rule is disabled")
            return None

        try:
            LOGGER.debug(f'Analyzing view: {node.name}')
            metrics = self.analyze_view(node)
            score = self.complexity_scorer.score_view(metrics)
            LOGGER.debug(f'Score for {node.name}: {score}')

            _, _, issue = self.complexity_scorer.interpret_score(score, node, metrics)
            return issue
        except SyntaxError:
            return None
        except Exception as e:
            LOGGER.error(f'Error analyzing view {node.name}: {e}')
            return None

    def analyze_view(self, node):
        """
        Analyze the given view function or class for basic metrics like line count and operation count.
        """
        line_count = self._get_line_count(node)
        operation_count = self._count_operations(node.body)

        return {
            'line_count': line_count,
            'operation_count': operation_count
        }

    def _get_line_count(self, node):
        """
        Get the number of lines for a given function or class, handling cases where end_lineno 
        may be missing or invalid.
        """
        if hasattr(node, 'end_lineno') and hasattr(node, 'lineno'):
            return node.end_lineno - node.lineno + 1
        else:
            # If line numbers are not available, fall back to counting lines from the node source segment
            return len(ast.get_source_segment(self.source_code, node).splitlines())

    def _count_operations(self, body):
        """
        Recursively count the number of operations (like function calls, conditionals, loops, exception handling)
        in the function or class body.
        """
        operations = 0
        for stmt in body:
            if isinstance(stmt, (ast.Assign, ast.Call, ast.If, ast.For, ast.While, ast.Try, ast.With, ast.Return,
                                ast.Raise, ast.ExceptHandler)):
                operations += 1

            if hasattr(stmt, 'body'):
                operations += self._count_operations(stmt.body)

            if hasattr(stmt, 'orelse') and stmt.orelse:
                operations += self._count_operations(stmt.orelse)

            if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
                operations += 1

            if isinstance(stmt, ast.Try):
                for handler in stmt.handlers:
                    operations += self._count_operations(handler.body)

        return operations
