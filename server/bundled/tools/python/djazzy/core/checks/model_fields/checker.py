import ast
from typing import Optional
from enum import Enum

from djazzy.core.lib.rules import RuleCode
from djazzy.core.checks.base import BaseCheckService
from ...lib.issue import Issue, IssueSeverity

class ModelFieldNames:
    RELATED_NAME = 'related_name'
    ON_DELETE = 'on_delete'
    NULL = 'null'
    FOREIGN_KEY = 'ForeignKey'
    CHARFIELD = 'CharField'
    TEXTFIELD = 'TextField'

class ModelFieldIssueDescription(Enum):
    MISSING_RELATED_NAME = "ForeignKey '{field_name}' is missing 'related_name'. It is recommended to always define 'related_name' for better reverse access."
    MISSING_ON_DELETE = "ForeignKey '{field_name}' is missing 'on_delete'. It is strongly recommended to always define 'on_delete' for better data integrity."
    NULLABLE_CHAR_OR_TEXT_FIELD = "CharField/TextField '{field_name}' uses null=True. Use blank=True instead to avoid NULL values. Django stores empty strings for text fields, keeping queries and validation simpler."

class ModelFieldIssue(Issue):
    code = RuleCode.CDQ05.value

    def __init__(self, lineno, col, description, severity=IssueSeverity.WARNING):
        super().__init__(lineno, col, severity)
        self.description = description
        self.severity = severity

    @property
    def message(self):
        return f"ModelFieldIssue: {self.description}"


class ModelFieldCheckService(BaseCheckService):
    def __init__(self, source_code):
        super().__init__()
        self.source_code = source_code

    def run_model_field_checks(self, node) -> Optional[ModelFieldIssue]:
        """
        Orchestrates the model field checks and returns a list of detected issues.
        """
        if not self.is_rule_enabled(RuleCode.CDQ05.value):
            return []

        issues = []
        
        related_name_issue = self.check_foreign_key_related_name(node)
        if related_name_issue:
            issues.append(related_name_issue)

        on_delete_issue = self.check_foreign_key_on_delete(node)
        if on_delete_issue:
            issues.append(on_delete_issue)

        nullable_issue = self.check_charfield_and_textfield_is_nullable(node)
        if nullable_issue:
            issues.append(nullable_issue)

        return issues

    def check_foreign_key_related_name(self, node) -> Optional[ModelFieldIssue]:
        if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute):
            if node.value.func.attr == ModelFieldNames.FOREIGN_KEY:
                for keyword in node.value.keywords:
                    if keyword.arg == ModelFieldNames.RELATED_NAME:
                        return None
                return ModelFieldIssue(
                    lineno=node.lineno,
                    col=node.col_offset,
                    description=ModelFieldIssueDescription.MISSING_RELATED_NAME.value.format(field_name=node.targets[0].id),
                    severity=IssueSeverity.WARNING
                )
        return None

    def check_foreign_key_on_delete(self, node) -> Optional[ModelFieldIssue]:
        if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute):
            if node.value.func.attr == ModelFieldNames.FOREIGN_KEY:
                for keyword in node.value.keywords:
                    if keyword.arg == ModelFieldNames.ON_DELETE:
                        return None
                return ModelFieldIssue(
                    lineno=node.lineno,
                    col=node.col_offset,
                    description=ModelFieldIssueDescription.MISSING_ON_DELETE.value.format(field_name=node.targets[0].id),
                    severity=IssueSeverity.WARNING
                )
        return None

    def check_charfield_and_textfield_is_nullable(self, node) -> Optional[ModelFieldIssue]:
        if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute):
            if node.value.func.attr in [ModelFieldNames.CHARFIELD, ModelFieldNames.TEXTFIELD]:
                for keyword in node.value.keywords:
                    if keyword.arg == ModelFieldNames.NULL and isinstance(keyword.value, ast.Constant) and keyword.value.value is True:
                        return ModelFieldIssue(
                            lineno=node.lineno,
                            col=node.col_offset,
                            description=ModelFieldIssueDescription.NULLABLE_CHAR_OR_TEXT_FIELD.value.format(field_name=node.targets[0].id),
                            severity=IssueSeverity.INFORMATION
                        )
                return None
        return None
