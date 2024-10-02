import unittest
import ast

from unittest.mock import patch

from djangoly.core.checks.model_fields import ModelFieldCheckService


class TestModelFieldCheckService(unittest.TestCase):

    @patch('djangoly.core.utils.log.LOGGER')
    def test_foreign_key_with_related_name_detected(self, mock_logger):
        source_code = "foreign_key = models.ForeignKey(User, related_name='user_set')"
        node = ast.parse(source_code).body[0]
        service = ModelFieldCheckService(source_code)

        result = service.run_model_field_checks(node)
        
        self.assertTrue(result['has_related_name_field'])

    @patch('djangoly.core.utils.log.LOGGER')
    def test_foreign_key_without_related_name_detected(self, mock_logger):
        source_code = "foreign_key = models.ForeignKey(User)"
        node = ast.parse(source_code).body[0]
        service = ModelFieldCheckService(source_code)

        result = service.run_model_field_checks(node)
        
        self.assertFalse(result['has_related_name_field'])

    @patch('djangoly.core.utils.log.LOGGER')
    def test_foreign_key_with_on_delete_detected(self, mock_logger):
        source_code = "foreign_key = models.ForeignKey(User, on_delete=models.CASCADE)"
        node = ast.parse(source_code).body[0]
        service = ModelFieldCheckService(source_code)

        result = service.run_model_field_checks(node)
        
        self.assertTrue(result['has_on_delete_field'])

    @patch('djangoly.core.utils.log.LOGGER')
    def test_foreign_key_without_on_delete_detected(self, mock_logger):
        source_code = "foreign_key = models.ForeignKey(User)"
        node = ast.parse(source_code).body[0]
        service = ModelFieldCheckService(source_code)

        result = service.run_model_field_checks(node)
        
        self.assertFalse(result['has_on_delete_field'])

    @patch('djangoly.core.utils.log.LOGGER')
    def test_charfield_with_nullable_detected(self, mock_logger):
        source_code = "name = models.CharField(max_length=100, null=True)"
        node = ast.parse(source_code).body[0]
        service = ModelFieldCheckService(source_code)

        result = service.run_model_field_checks(node)
        
        self.assertTrue(result['is_charfield_or_textfield_nullable'])

    @patch('djangoly.core.utils.log.LOGGER')
    def test_charfield_without_nullable_detected(self, mock_logger):
        source_code = "name = models.CharField(max_length=100)"
        node = ast.parse(source_code).body[0]
        service = ModelFieldCheckService(source_code)

        result = service.run_model_field_checks(node)
        
        self.assertFalse(result['is_charfield_or_textfield_nullable'])

    @patch('djangoly.core.utils.log.LOGGER')
    def test_textfield_with_nullable_detected(self, mock_logger):
        source_code = "description = models.TextField(null=True)"
        node = ast.parse(source_code).body[0]
        service = ModelFieldCheckService(source_code)

        result = service.run_model_field_checks(node)
        
        self.assertTrue(result['is_charfield_or_textfield_nullable'])

    @patch('djangoly.core.utils.log.LOGGER')
    def test_textfield_without_nullable_detected(self, mock_logger):
        source_code = "description = models.TextField()"
        node = ast.parse(source_code).body[0]
        service = ModelFieldCheckService(source_code)

        result = service.run_model_field_checks(node)
        
        self.assertFalse(result['is_charfield_or_textfield_nullable'])


if __name__ == '__main__':
    unittest.main()
