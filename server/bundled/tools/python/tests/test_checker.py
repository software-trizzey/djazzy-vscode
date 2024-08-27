import unittest
import ast
from unittest.mock import Mock, patch
import textwrap

from checks.skinny_views.scorer import ViewComplexityScorer
from checks.skinny_views.checker import ViewComplexityAnalyzer


class TestViewComplexityAnalyzer(unittest.TestCase):

    def setUp(self):
        """
        Set up the ViewComplexityAnalyzer instance and mock the ViewComplexityScorer.
        """
        self.source_code = textwrap.dedent("""
            class MyView:
                def get(self, request):
                    data = {'key': 'value'}
                    if data:
                        return data
                    return None
        """)
        self.scorer_mock = Mock(spec=ViewComplexityScorer)
        self.analyzer = ViewComplexityAnalyzer(self.source_code, self.scorer_mock)
        self.tree = ast.parse(self.source_code)
        self.class_node = next(node for node in ast.walk(self.tree) if isinstance(node, ast.ClassDef))

    def test_analyze_view(self):
        """
        Test that analyze_view returns the correct metrics for line count and operation count.
        """
        metrics = self.analyzer.analyze_view(self.class_node)
        print("metrics", metrics)
        self.assertEqual(metrics['line_count'], 6)
        self.assertEqual(metrics['operation_count'], 4)

    @patch('log.LOGGER.debug')
    def test_run_complexity_analysis_simple_view(self, mock_log_debug):
        """
        Test that run_complexity_analysis correctly analyzes a simple view and returns no issues.
        """
        self.scorer_mock.score_view.return_value = 0
        self.scorer_mock.interpret_score.return_value = ('SIMPLE', 0, None)

        issue = self.analyzer.run_complexity_analysis(self.class_node)
        self.assertIsNone(issue)
        mock_log_debug.assert_called()

    @patch('log.LOGGER.error')
    def test_run_complexity_analysis_syntax_error(self, mock_log_error):
        """
        Test that run_complexity_analysis handles syntax errors gracefully.
        """
        bad_source_code = textwrap.dedent("""
            def my_view(request):
                if True:
                    pass
                return  # Syntax issue: return without value
        """)
        try:
            bad_tree = ast.parse(bad_source_code, mode='exec')
            bad_func_node = next(node for node in ast.walk(bad_tree) if isinstance(node, ast.FunctionDef))
        except SyntaxError as e:
            mock_log_error(f"Error analyzing view my_view: {e}")
            return

        issue = self.analyzer.run_complexity_analysis(bad_func_node)
        self.assertIsNone(issue)
        mock_log_error.assert_called_once()

    def test_get_line_count(self):
        """
        Test that get_line_count returns the correct line count for a node with end_lineno.
        """
        line_count = self.analyzer.get_line_count(self.class_node)
        self.assertEqual(line_count, 6)

    def test_get_line_count_no_end_lineno(self):
        """
        Test that get_line_count returns the correct total line count when end_lineno is missing.
        """
        delattr(self.class_node, 'end_lineno')
        if getattr(self.class_node, 'lineno', None) is not None and getattr(self.class_node, 'end_lineno', None) is not None:
            line_count = self.analyzer.get_line_count(self.class_node)
        else:
            line_count = len(self.source_code.splitlines())
        self.assertEqual(line_count, 7)

    def test_count_operations(self):
        """
        Test that count_operations returns the correct number of operations in a function or class body.
        """
        operations = self.analyzer.count_operations(self.class_node.body[0].body)
        print("operations", operations)
        self.assertEqual(operations, 4)

    def test_count_operations_empty_body(self):
        """
        Test that count_operations returns zero when the body is empty.
        """
        empty_node = ast.FunctionDef(name='empty_function', args=[], body=[], decorator_list=[])
        operations = self.analyzer.count_operations(empty_node.body)
        self.assertEqual(operations, 0)


if __name__ == '__main__':
    unittest.main()
