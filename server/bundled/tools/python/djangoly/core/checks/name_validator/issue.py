from djangoly.core.lib.issue import Issue, IssueSeverity

class NameIssue(Issue):
    def __init__(self, lineno, col, description, rule_code, severity=IssueSeverity.WARNING, parameters=None):
        super().__init__(lineno, col, severity, parameters)
        self.code = rule_code
        self.description = description
        self.severity = severity
