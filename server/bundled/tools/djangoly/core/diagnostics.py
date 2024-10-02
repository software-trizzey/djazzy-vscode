class Diagnostic:
    def __init__(
            self,
            file_path,
            line,
            col_offset,
            end_col_offset,
            severity,
            message,
            issue_code,
            related_issues=None
        ):
        """
        Diagnostic represents an issue detected in a specific file.
        :param file_path: Path to the file where the issue occurred.
        :param line: The line number where the issue was found.
        :param col_offset: The column where the issue starts.
        :param end_col_offset: The column where the issue ends.
        :param severity: Severity of the issue (ERROR, WARNING, etc.).
        :param message: Description of the issue.
        :param issue_code: The code corresponding to the rule violated (from the Issue class).
        :param related_issues: A list of Issue objects related to the diagnostic.
        """
        self.file_path = file_path
        self.line = line
        self.col_offset = col_offset
        self.end_col_offset = end_col_offset
        self.severity = severity
        self.message = message
        self.issue_code = issue_code
        self.related_issues = related_issues if related_issues else []

    def add_issue(self, issue):
        """Add an Issue to the Diagnostic."""
        self.related_issues.append(issue)

    def to_dict(self):
        """Convert the Diagnostic object to a dictionary for JSON output, including dynamically added fields."""
        result = self.__dict__.copy()
        result['related_issues'] = [issue.message for issue in self.related_issues]
        return result
