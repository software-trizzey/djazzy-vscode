import unittest
import ast
from unittest.mock import patch
import textwrap

from djangoly.core.services.view_detector import DjangoViewDetectionService, DjangoViewType


class TestDjangoViewDetectionService(unittest.TestCase):

    def setUp(self):
        """
        Set up the DjangoViewDetectionService instance before each test.
        """
        self.view_detector = DjangoViewDetectionService()

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_initialize_with_tree(self, mock_log_debug):
        """
        Test that initialize extracts Django imports when an AST tree is provided.
        """
        source_code = textwrap.dedent("""
            from django.views import View
            from django.views.generic import TemplateView
        """)
        tree = ast.parse(source_code)
        self.view_detector.initialize(tree)

        self.assertIn('View', self.view_detector.django_imports)
        self.assertIn('TemplateView', self.view_detector.django_imports)
        self.assertEqual(len(self.view_detector.django_imports), 2)
        mock_log_debug.assert_called()

    @patch('djangoly.core.utils.log.LOGGER.warning')
    def test_initialize_without_tree(self, mock_log_warning):
        """
        Test that initialize logs a warning and clears imports when no AST tree is provided.
        """
        self.view_detector.initialize(None)

        self.assertEqual(len(self.view_detector.django_imports), 0)
        mock_log_warning.assert_called_once_with("Initializing DjangoViewDetectionService without AST")

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_is_django_view_class_inherits_from_view(self, mock_log_debug):
        """
        Test that a class inheriting from a Django view base class is identified as a view class.
        """
        source_code = textwrap.dedent("""
            from django.views import View
            
            class MyView(View):
                pass
        """)
        tree = ast.parse(source_code)
        self.view_detector.initialize(tree)
        class_node = next(node for node in ast.walk(tree) if isinstance(node, ast.ClassDef) and node.name == "MyView")
        
        self.assertTrue(self.view_detector.is_django_view_class(class_node))
        mock_log_debug.assert_called()

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_is_django_view_class_inherits_from_mixin(self, mock_log_debug):
        """
        Test that a class inheriting from a Django view mixin is identified as a view class.
        """
        source_code = textwrap.dedent("""
            from django.views.generic import TemplateView
            from django.contrib.auth.mixins import LoginRequiredMixin
            
            class MySecureView(LoginRequiredMixin, TemplateView):
                pass
        """)
        tree = ast.parse(source_code)
        self.view_detector.initialize(tree)
        class_node = next(node for node in ast.walk(tree) if isinstance(node, ast.ClassDef) and node.name == "MySecureView")
        
        self.assertTrue(self.view_detector.is_django_view_class(class_node))
        mock_log_debug.assert_called()

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_is_not_django_view_class(self, mock_log_debug):
        """
        Test that a class not inheriting from a Django view base or mixin is not identified as a view class.
        """
        source_code = textwrap.dedent("""
            class MyNonView:
                pass
        """)
        tree = ast.parse(source_code)
        self.view_detector.initialize(tree)
        class_node = next(node for node in ast.walk(tree) if isinstance(node, ast.ClassDef) and node.name == "MyNonView")
        
        self.assertFalse(self.view_detector.is_django_view_class(class_node))
        mock_log_debug.assert_called()

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_get_django_class_type_for_view(self, mock_log_debug):
        """
        Test that a class inheriting from a Django view is correctly identified as a class view.
        """
        source_code = textwrap.dedent("""
            from django.views import View
            
            class MyView(View):
                pass
        """)
        tree = ast.parse(source_code)
        self.view_detector.initialize(tree)
        class_node = next(node for node in ast.walk(tree) if isinstance(node, ast.ClassDef) and node.name == "MyView")
        class_definitions = {class_node.name: class_node}

        class_type = self.view_detector.get_django_class_type(class_node, class_definitions)
        self.assertEqual(class_type, DjangoViewType.CLASS_VIEW)
        mock_log_debug.assert_called()

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_get_django_class_type_for_model(self, mock_log_debug):
        """
        Test that a class inheriting from models.Model is correctly identified as a Django model.
        """
        source_code = textwrap.dedent("""
            from django.db import models
            
            class MyModel(models.Model):
                pass
        """)
        tree = ast.parse(source_code)
        self.view_detector.initialize(tree)
        class_node = next(node for node in ast.walk(tree) if isinstance(node, ast.ClassDef) and node.name == "MyModel")
        class_definitions = {class_node.name: class_node}

        class_type = self.view_detector.get_django_class_type(class_node, class_definitions)
        self.assertEqual(class_type, 'django_model')
        mock_log_debug.assert_called()

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_get_django_class_type_uses_cache(self, mock_log_debug):
        """
        Test that the class type cache is correctly used and prevents repeated calculations.
        """
        source_code = textwrap.dedent("""
            from django.views import View
            
            class MyView(View):
                pass
        """)
        tree = ast.parse(source_code)
        self.view_detector.initialize(tree)
        class_node = next(node for node in ast.walk(tree) if isinstance(node, ast.ClassDef) and node.name == "MyView")
        class_definitions = {class_node.name: class_node}

        class_type = self.view_detector.get_django_class_type(class_node, class_definitions)
        self.assertEqual(class_type, DjangoViewType.CLASS_VIEW)

        class_type_cached = self.view_detector.get_django_class_type(class_node, class_definitions)
        self.assertEqual(class_type_cached, DjangoViewType.CLASS_VIEW)
        self.assertEqual(self.view_detector.class_type_cache[class_node.name], DjangoViewType.CLASS_VIEW)
        mock_log_debug.assert_called()

    @patch('djangoly.core.utils.log.LOGGER.debug')
    def test_max_depth_handling(self, mock_log_debug):
        """
        Test that the service respects the maximum recursion depth when processing parent classes.
        """
        source_code = textwrap.dedent("""
            class A: pass
            class B(A): pass
            class C(B): pass
            class D(C): pass
            class E(D): pass
            class F(E): pass  # This will exceed the max depth
        """)
        tree = ast.parse(source_code)
        class_node = next(node for node in ast.walk(tree) if isinstance(node, ast.ClassDef) and node.name == "F")
        class_definitions = {node.name: node for node in ast.walk(tree) if isinstance(node, ast.ClassDef)}

        class_type = self.view_detector.get_django_class_type(class_node, class_definitions)
        self.assertIsNone(class_type)  # No Django class type identified due to depth limit
        mock_log_debug.assert_called()

if __name__ == '__main__':
    unittest.main()
