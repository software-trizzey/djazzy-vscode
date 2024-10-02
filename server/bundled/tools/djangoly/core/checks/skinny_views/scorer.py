import ast

from djangoly.core.utils.issue import IssueSeverity

from .constants import ComplexityIssue, ScoreInterpretationEnum, ScoreWeightEnum


class ScoreThresholds:
    def __init__(self, line_threshold=100, operation_threshold=25, max_score=100):
        """
        Initialize threshold values for complexity scoring.
        :param line_threshold: The number of lines beyond which the view is considered complex.
        :param operation_threshold: The number of operations beyond which the view is considered complex.
        :param max_score: The maximum score a view can receive.
        """
        self.line_threshold = line_threshold
        self.operation_threshold = operation_threshold
        self.max_score = max_score

    def score_line_count(self, line_count: int):
        """
        Score the view based on line count.
        """
        if line_count > self.line_threshold:
            return (line_count / self.line_threshold) * (self.max_score / 2)
        return 0

    def score_operation_count(self, operation_count: int):
        """
        Score the view based on operation count.
        """
        if operation_count > self.operation_threshold:
            return (operation_count / self.operation_threshold) * (self.max_score / 2)
        return 0

    def calculate_total_score(self, line_count: int, operation_count: int):
        """
        Calculate the total score based on both line count and operation count.
        """
        score = min(
            self.score_line_count(line_count) + self.score_operation_count(operation_count),
            self.max_score
        )
        return score


class ViewComplexityScorer:
    def __init__(self, thresholds: ScoreThresholds):
        """
        Initialize the scorer with provided score thresholds.
        """
        self.thresholds = thresholds

    def score_view(self, metrics: dict):
        """
        Score the view based on the provided metrics.
        """
        line_count = metrics.get('line_count', 0)
        operation_count = metrics.get('operation_count', 0)

        score = self.thresholds.calculate_total_score(line_count, operation_count)
        return score

    def interpret_score(self, score: int, node: ast.AST, metrics: dict):
        """
        Interpret the score to determine whether the view is too complex.
        Create a ComplexityIssue if the view is considered complex or moderate.
        """
        if score >= ScoreWeightEnum.COMPLEX:
            complexity_level = ScoreInterpretationEnum.COMPLEX
        elif ScoreWeightEnum.MODERATE <= score < ScoreWeightEnum.COMPLEX:
            complexity_level = ScoreInterpretationEnum.MODERATE
        else:
            complexity_level = ScoreInterpretationEnum.SIMPLE

        if complexity_level in [ScoreInterpretationEnum.COMPLEX, ScoreInterpretationEnum.MODERATE]:
            issue = ComplexityIssue(
                view_name=node.name,
                lineno=node.lineno,
                col=node.col_offset,
                line_count=metrics['line_count'],
                operation_count=metrics['operation_count'],
                severity=IssueSeverity.WARNING #TODO: make this configurable
            )
            return complexity_level, score, issue

        return complexity_level, score, None