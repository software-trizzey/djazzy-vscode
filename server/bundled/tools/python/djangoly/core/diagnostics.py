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
        full_line_length,
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
        """
        self.file_path = file_path
        self.line = line
        self.col_offset = col_offset
        self.end_col_offset = end_col_offset
        self.severity = severity
        self.message = message
        self.issue_code = issue_code
        self.full_line_length = full_line_length

    def to_dict(self):
        """Convert the Diagnostic object to a dictionary for JSON output, including dynamically added fields."""
        result = self.__dict__.copy()
        return result
