import unittest
import ast
from unittest.mock import Mock, patch

from djangoly.core.checks.skinny_views.scorer import (
    ViewComplexityScorer,
    ScoreThresholds,
    ScoreInterpretationEnum,
    ScoreWeightEnum
)


class TestViewComplexityScorer(unittest.TestCase):
    
    def setUp(self):
        self.thresholds = ScoreThresholds(line_threshold=50, operation_threshold=10, max_score=100)
        self.scorer = ViewComplexityScorer(thresholds=self.thresholds)
        
        self.node = Mock(spec=ast.AST)
        self.node.name = 'TestView'
        self.node.lineno = 5
        self.node.col_offset = 2

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_simple_view(self, mock_log_info):
        """
        Test a simple view with low line count and operation count.
        """
        metrics = {
            'line_count': 30,
            'operation_count': 5
        }
        score = self.scorer.score_view(metrics)
        complexity_level, _, issue = self.scorer.interpret_score(score, self.node, metrics)
        
        self.assertEqual(complexity_level, ScoreInterpretationEnum.SIMPLE)
        self.assertEqual(score, 0)
        self.assertIsNone(issue)

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_moderate_view(self, mock_log_info):
        """
        Test a view with moderate complexity.
        """
        EXPECTED_LINE_COUNT = 50
        EXPECTED_OPERATION_COUNT = 12
        metrics = {
            'line_count': EXPECTED_LINE_COUNT,
            'operation_count': EXPECTED_OPERATION_COUNT
        }
        score = self.scorer.score_view(metrics)
        complexity_level, interpreted_score, issue = self.scorer.interpret_score(score, self.node, metrics)
        
        self.assertEqual(complexity_level, ScoreInterpretationEnum.MODERATE)
        self.assertTrue(ScoreWeightEnum.MODERATE <= interpreted_score < ScoreWeightEnum.COMPLEX)
        self.assertIsNotNone(issue)
        self.assertEqual(issue.parameters['line_count'], EXPECTED_LINE_COUNT)
        self.assertEqual(issue.parameters['operation_count'], EXPECTED_OPERATION_COUNT)

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_complex_view(self, mock_log_info):
        """
        Test a view that is considered complex based on line count and operation count.
        """
        EXPECTED_LINE_COUNT = 120
        EXPECTED_OPERATION_COUNT = 25
        metrics = {
            'line_count': EXPECTED_LINE_COUNT,
            'operation_count': EXPECTED_OPERATION_COUNT
        }
        score = self.scorer.score_view(metrics)
        complexity_level, interpreted_score, issue = self.scorer.interpret_score(score, self.node, metrics)
        
        self.assertEqual(complexity_level, ScoreInterpretationEnum.COMPLEX)
        self.assertGreaterEqual(interpreted_score, ScoreWeightEnum.COMPLEX)
        self.assertIsNotNone(issue)
        self.assertEqual(issue.parameters['line_count'], EXPECTED_LINE_COUNT)
        self.assertEqual(issue.parameters['operation_count'], EXPECTED_OPERATION_COUNT)

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_edge_case_zero_metrics(self, mock_log_info):
        """
        Test with a zero line count and operation count.
        """
        metrics = {
            'line_count': 0,
            'operation_count': 0
        }
        score = self.scorer.score_view(metrics)
        complexity_level, _, issue = self.scorer.interpret_score(score, self.node, metrics)
        
        self.assertEqual(complexity_level, ScoreInterpretationEnum.SIMPLE)
        self.assertEqual(score, 0)
        self.assertIsNone(issue)

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_edge_case_maximum_metrics(self, mock_log_info):
        """
        Test with maximum possible values for line count and operation count.
        """
        MAX_SCORE = 100
        EXPECTED_LINE_COUNT = 1000
        EXPECTED_OPERATION_COUNT = 500
        metrics = {
            'line_count': EXPECTED_LINE_COUNT,
            'operation_count': EXPECTED_OPERATION_COUNT
        }
        score = self.scorer.score_view(metrics)
        complexity_level, _, issue = self.scorer.interpret_score(score, self.node, metrics)
        
        self.assertEqual(complexity_level, ScoreInterpretationEnum.COMPLEX)
        self.assertEqual(score, MAX_SCORE)
        self.assertIsNotNone(issue)
        self.assertEqual(issue.parameters['line_count'], EXPECTED_LINE_COUNT)
        self.assertEqual(issue.parameters['operation_count'], EXPECTED_OPERATION_COUNT)

if __name__ == '__main__':
    unittest.main()
