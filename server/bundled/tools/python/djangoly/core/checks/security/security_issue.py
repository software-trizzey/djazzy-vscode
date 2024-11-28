from djangoly.core.lib.issue import Issue


class SecurityIssue(Issue):
    """
    Security issue class inheriting from the abstract Issue class.
    """
    def __init__(self, code: str, lineno: int, message: str, severity: str, doc_link: str = None, col_offset: int = 0, end_col_offset: int = 0):
        super().__init__(lineno, col=col_offset, severity=severity)
        self.code = code
        self.description = message
        self.severity = severity
        self.doc_link = doc_link
        self.end_col_offset = end_col_offset

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
    
    def __eq__(self, other):
        return self.code == other.code and self.description == other.description and self.severity == other.severity and self.doc_link == other.doc_link

    def __hash__(self):
        return hash((self.code, self.description, self.severity, self.doc_link))
