import ast

from typing import Optional



class ModelFieldNames:
	RELATED_NAME = 'related_name'
	ON_DELETE = 'on_delete'
	NULL = 'null'
	FOREIGN_KEY = 'ForeignKey'
	CHARFIELD = 'CharField'
	TEXTFIELD = 'TextField'


class ModelFieldIssue:
	def __init__(self, line_number, message, severity):
		self.line_number = line_number
		self.message = message
		self.severity = severity

	def __str__(self):
		return f"ModelFieldIssue - {self.message}"

	def __repr__(self):
		return str(self)


class ModelFieldCheckService:
    def __init__(self, source_code):
        self.source_code = source_code

    def run_model_field_checks(self, node):
        """
        Orchestrates the model field checks and returns the results.

        Returns:
            - A dictionary containing the results for each check.
        """
        results = {
            'has_related_name_field': self.check_foreign_key_related_name(node),
            'has_on_delete_field': self.check_foreign_key_on_delete(node),
            'is_charfield_or_textfield_nullable': self.check_charfield_and_textfield_is_nullable(node)
        }
        return results

    def check_foreign_key_related_name(self, node) -> Optional[bool]:
        if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute):
            if node.value.func.attr == ModelFieldNames.FOREIGN_KEY:
                for keyword in node.value.keywords:
                    if keyword.arg == ModelFieldNames.RELATED_NAME:
                        return True
                return False
        return None
    
    def check_foreign_key_on_delete(self, node) -> Optional[bool]:
        if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute):
            if node.value.func.attr == ModelFieldNames.FOREIGN_KEY:
                for keyword in node.value.keywords:
                    if keyword.arg == ModelFieldNames.ON_DELETE:
                        return True
                return False
        return None

    def check_charfield_and_textfield_is_nullable(self, node) -> Optional[bool]:
        if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute):
            if node.value.func.attr in [ModelFieldNames.CHARFIELD, ModelFieldNames.TEXTFIELD]:
                for keyword in node.value.keywords:
                    if keyword.arg == ModelFieldNames.NULL and isinstance(keyword.value, ast.Constant) and keyword.value.value is True:
                        return True
                return False
        return None
