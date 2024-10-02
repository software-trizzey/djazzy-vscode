from djangoly.core.utils.issue import Issue


class SecurityIssue(Issue):
    """
    Security issue class inheriting from the abstract Issue class.
    """
    def __init__(self, code: str, lineno: int, message: str, severity: str, doc_link: str = None):
        super().__init__(lineno, col=0)
        self.code = code
        self.description = message
        self.severity = severity
        self.doc_link = doc_link

    @property
    def message(self):
        """
        Return the issue message with the code prefixed.
        """
        return super().message

    def __str__(self):
        return f'{self.code} - {self.description}'

    def __repr__(self):
        return str(self)