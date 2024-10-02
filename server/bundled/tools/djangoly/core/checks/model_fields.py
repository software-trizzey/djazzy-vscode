import ast
from typing import Optional

from djangoly.core.utils.rules import RuleCode
from ..utils.issue import Issue, IssueSeverity




class ModelFieldNames:
    RELATED_NAME = 'related_name'
    ON_DELETE = 'on_delete'
    NULL = 'null'
    FOREIGN_KEY = 'ForeignKey'
    CHARFIELD = 'CharField'
    TEXTFIELD = 'TextField'


class ModelFieldIssue(Issue):
    def __init__(self, lineno, col, description, severity=IssueSeverity.WARNING):
        parameters = {"severity": severity}
        super().__init__(lineno, col, parameters)
        self.code = RuleCode.CDQ11.value
        self.description = description
        self.severity = severity

    @property
    def message(self):
        return f"ModelFieldIssue: {self.description}"


class ModelFieldCheckService:
    def __init__(self, source_code):
        self.source_code = source_code

    def run_model_field_checks(self, node) -> Optional[ModelFieldIssue]:
        """
        Orchestrates the model field checks and returns a list of detected issues.
        """
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
                    description=f"ForeignKey '{node.targets[0].id}' is missing 'related_name'. It is recommended to always define 'related_name' for better reverse access.",
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
                    description=f"ForeignKey '{node.targets[0].id}' is missing 'on_delete'. It is strongly recommended to always define 'on_delete' for better data integrity.",
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
                            description=f"CharField/TextField '{node.targets[0].id}' uses null=True. Use blank=True instead to avoid NULL values. Django stores empty strings for text fields, keeping queries and validation simpler.",
                            severity=IssueSeverity.INFORMATION
                        )
                return None
        return None
