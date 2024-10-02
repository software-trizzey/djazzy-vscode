import ast
import unittest
import textwrap
from unittest.mock import patch

from djangoly.core.checks.redundant_queryset_methods.checker import RedundantQueryMethodCheckService
from djangoly.core.utils.issue import IssueSeverity

class TestRedundantQueryMethodCheckService(unittest.TestCase):

    @patch('djangoly.core.utils.log.LOGGER')
    def test_redundant_queryset_count_all_detected(self, mock_logger):
        source_code = textwrap.dedent("""
            def get_customer_count():
                return Customer.objects.all().count()
        """)
        service = RedundantQueryMethodCheckService(source_code)
        tree = ast.parse(source_code)
        
        issue = service.run_check(tree)
        
        self.assertIsNotNone(issue)
        self.assertEqual(issue.method_chain, "all.count")
        self.assertEqual(issue.simplified_chain, "count()")
        self.assertEqual(issue.severity, IssueSeverity.INFORMATION)
        self.assertIn("Redundant QuerySet method chain detected", issue.message)
        self.assertIn("Consider replacing", issue.message)
        self.assertIn("count()", issue.fixed_queryset)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_non_redundant_queryset_not_detected(self, mock_logger):
        source_code = textwrap.dedent("""
            def get_customer():
                return Customer.objects.get(id=1)
        """)
        service = RedundantQueryMethodCheckService(source_code)
        tree = ast.parse(source_code)
        
        issue = service.run_check(tree)
        
        self.assertIsNone(issue)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_all_filter_redundancy_detected(self, mock_logger):
        source_code = textwrap.dedent("""
        def get_active_customers():
            return Customer.objects.all().filter(is_active=True)
        """)
        service = RedundantQueryMethodCheckService(source_code)
        tree = ast.parse(source_code)
        
        issue = service.run_check(tree)
        print("issue", issue)
        
        self.assertIsNotNone(issue)
        self.assertEqual(issue.code, 'CDQ14')
        self.assertEqual(issue.severity, IssueSeverity.INFORMATION)
        self.assertIn('Redundant QuerySet method chain detected', issue.message)
        self.assertIn('Consider replacing "all().filter()" with "filter()"', issue.message)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_filter_not_redundant(self, mock_logger):
        source_code = textwrap.dedent("""
        def get_active_customers():
            return Customer.objects.filter(is_active=True)
        """)
        service = RedundantQueryMethodCheckService(source_code)
        tree = ast.parse(source_code)
        
        issue = service.run_check(tree)
        
        self.assertIsNone(issue)


if __name__ == '__main__':
    unittest.main()
