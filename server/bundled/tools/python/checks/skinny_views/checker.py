import ast

from log import LOGGER

from checks.skinny_views.scorer import ViewComplexityScorer
from checks.skinny_views.constants import ComplexityIssue

class ViewComplexityAnalyzer:
    def __init__(self, source_code, complexity_scorer: ViewComplexityScorer):
        self.source_code = source_code
        self.complexity_scorer = complexity_scorer
        self.tree = ast.parse(source_code)

    def analyze_view(self, node):
        """
        Analyze the given view function or class for basic metrics like line count and operation count.
        """
        line_count = self.get_line_count(node)
        operation_count = self.count_operations(node.body)

        return {
            'line_count': line_count,
            'operation_count': operation_count
        }

    def run_complexity_analysis(self, node) -> ComplexityIssue | None:
        """
        Run complexity analysis on the given view function or class and return issues if detected.
        """
        try:
            LOGGER.debug(f'Analyzing view: {node.name}')
            metrics = self.analyze_view(node)
            score = self.complexity_scorer.score_view(metrics)
            LOGGER.debug(f'Score for {node.name}: {score}')

            _, _, issue = self.complexity_scorer.interpret_score(score, node, metrics)
            return issue
        except SyntaxError as e:
            LOGGER.error(f'Error parsing view {node.name}: {e}')
            return None
        except Exception as e:
            LOGGER.error(f'Error analyzing view {node.name}: {e}')
            return None

    def get_line_count(self, node):
        """
        Get the number of lines for a given function or class.
        """
        return node.end_lineno - node.lineno + 1 if hasattr(node, 'end_lineno') else len(self.source_code.splitlines())

    def count_operations(self, body):
        """
        Count the number of operations (like function calls, conditionals, loops) in the function body.
        """
        return sum(isinstance(stmt, (ast.Assign, ast.Call, ast.If, ast.For, ast.While, ast.Try, ast.With)) for stmt in body)
