import unittest
import ast
import textwrap
from unittest.mock import patch

from djangoly.core.checks.exception_handlers.checker import ExceptionHandlingCheckService
from djangoly.core.checks.exception_handlers.constants import ExceptionHandlingIssue


class TestExceptionHandlingCheckService(unittest.TestCase):

    @patch('djangoly.core.utils.log.LOGGER')
    def test_exception_handling_present(self, mock_logger):
        source_code = textwrap.dedent("""
        def my_function():
            try:
                x = 1 / 0
            except ZeroDivisionError:
                pass
        """)
        node = ast.parse(source_code).body[0]
        service = ExceptionHandlingCheckService(source_code)

        result = service.run_check(node)
        
        self.assertIsNone(result, "Expected no issue since exception handling is present")

    @patch('djangoly.core.utils.log.LOGGER')
    def test_exception_handling_absent(self, mock_logger):
        source_code = textwrap.dedent("""
        def my_function():
            x = 1 / 0
        """)
        node = ast.parse(source_code).body[0]
        service = ExceptionHandlingCheckService(source_code)

        result = service.run_check(node)
        
        self.assertIsInstance(result, ExceptionHandlingIssue, "Expected an issue since exception handling is absent")
        self.assertEqual(result.lineno, 2)
        self.assertEqual(result.col, 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_run_check_on_class(self, mock_logger):
        source_code = textwrap.dedent("""
        class MyClass:
            def my_method(self):
                x = 1 / 0
        """)
        node = ast.parse(source_code).body[0]
        service = ExceptionHandlingCheckService(source_code)

        result = service.run_check(node)

        self.assertIsInstance(result, ExceptionHandlingIssue, "Expected an issue since exception handling is absent")
        self.assertEqual(result.lineno, 2)
        self.assertEqual(result.col, 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_general_exception_handling(self, mock_logger):
        source_code = textwrap.dedent("""
        def my_function():
            try:
                x = 1 / 0
            except Exception as e:
                pass
        """)
        node = ast.parse(source_code).body[0]
        service = ExceptionHandlingCheckService(source_code)

        result = service.run_check(node)
        
        self.assertIsNone(result, "Expected no issue since general exception handling is present")


if __name__ == '__main__':
    unittest.main()
