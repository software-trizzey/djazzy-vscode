from djazzy.core.lib.issue import Issue
from djazzy.core.lib.issue import IssueSeverity
from djazzy.core.lib.rules import RuleCode


class TestNameConventionIssue(Issue):
    code = RuleCode.STY03.value
    description="Test names should follow the pattern `test_{result}_given|when|if_{conditions}`."

    def __init__(self, lineno, col, description,  severity=IssueSeverity.WARNING, parameters=None):
        super().__init__(lineno, col, severity, parameters)
        self.description = description
        self.severity = severity
