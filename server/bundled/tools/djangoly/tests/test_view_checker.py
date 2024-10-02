import unittest
import ast
from unittest.mock import Mock, patch
import textwrap

from djangoly.core.checks.skinny_views.scorer import ViewComplexityScorer, ScoreWeightEnum
from djangoly.core.checks.skinny_views.checker import ViewComplexityAnalyzer


class TestViewComplexityAnalyzer(unittest.TestCase):

    def setUp(self):
        self.simple_source_code = textwrap.dedent("""
            class MyView:
                def get(self, request):
                    data = {'key': 'value'}
                    if data:
                        return data
                    return None
        """)
        self.complex_source_code = textwrap.dedent("""
            class MyComplexView:
                def get(self, request):
                    try:
                        result = []
                        for item in range(5):
                            if item % 2 == 0:
                                result.append(item * 2)
                            else:
                                result.append(item + 2)
                        if not result:
                            raise ValueError("No result generated.")
                        return result
                    except ValueError as e:
                        return {'error': str(e)}
        """)
        self.scorer_mock = Mock(spec=ViewComplexityScorer)

    def test_analyze_view(self):
        """
        Test that analyze_view returns the correct metrics for line count and operation count
        for a simple view.
        """
        analyzer = ViewComplexityAnalyzer(self.simple_source_code, self.scorer_mock)
        tree = ast.parse(self.simple_source_code)
        class_node = next(node for node in ast.walk(tree) if isinstance(node, ast.ClassDef))
        metrics = analyzer.analyze_view(class_node)
        self.assertEqual(metrics['line_count'], 6)
        self.assertEqual(metrics['operation_count'], 4)

    def test_analyze_complex_view(self):
        """
        Test that analyze_view returns the correct metrics for line count and operation count
        for a more complex view.
        """
        analyzer = ViewComplexityAnalyzer(self.complex_source_code, self.scorer_mock)
        tree = ast.parse(self.complex_source_code)
        class_node = next(node for node in ast.walk(tree) if isinstance(node, ast.ClassDef))
        metrics = analyzer.analyze_view(class_node)
        self.assertEqual(metrics['line_count'], 14)
        self.assertEqual(metrics['operation_count'], 10)
        
    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_run_complexity_analysis_simple_view(self, mock_log_debug):
        """
        Test that run_complexity_analysis correctly analyzes a simple view and returns no issues.
        """
        analyzer = ViewComplexityAnalyzer(self.simple_source_code, self.scorer_mock)
        tree = ast.parse(self.simple_source_code)
        class_node = next(node for node in ast.walk(tree) if isinstance(node, ast.ClassDef))

        self.scorer_mock.score_view.return_value = 0
        self.scorer_mock.interpret_score.return_value = ('SIMPLE', 0, None)

        issue = analyzer.run_complexity_analysis(class_node)
        self.assertIsNone(issue)
        mock_log_debug.assert_called()

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_run_complexity_analysis_complex_view(self, mock_log_debug):
        """
        Test that run_complexity_analysis correctly analyzes a complex view and returns the correct score.
        """
        analyzer = ViewComplexityAnalyzer(self.complex_source_code, self.scorer_mock)
        tree = ast.parse(self.complex_source_code)
        class_node = next(node for node in ast.walk(tree) if isinstance(node, ast.ClassDef))
		
        self.scorer_mock.score_view.return_value = ScoreWeightEnum.MODERATE
        self.scorer_mock.interpret_score.return_value = ('MODERATE', ScoreWeightEnum.MODERATE , None)

        issue = analyzer.run_complexity_analysis(class_node)
        self.assertIsNone(issue)
        mock_log_debug.assert_called()

    def test_count_operations_complex_view(self):
        """
        Test that count_operations returns the correct number of operations in a complex view.
        """
        analyzer = ViewComplexityAnalyzer(self.complex_source_code, self.scorer_mock)
        tree = ast.parse(self.complex_source_code)
        class_node = next(node for node in ast.walk(tree) if isinstance(node, ast.ClassDef))
        operations = analyzer.count_operations(class_node.body[0].body)
        self.assertEqual(operations, 10)

    def test_count_operations_empty_body(self):
        """
        Test that count_operations returns zero when the body is empty.
        """
        empty_node = ast.FunctionDef(name='empty_function', args=[], body=[], decorator_list=[])
        analyzer = ViewComplexityAnalyzer(self.simple_source_code, self.scorer_mock)
        operations = analyzer.count_operations(empty_node.body)
        self.assertEqual(operations, 0)


if __name__ == '__main__':
    unittest.main()
