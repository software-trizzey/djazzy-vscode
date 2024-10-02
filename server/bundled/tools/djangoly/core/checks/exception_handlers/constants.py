from djangoly.core.utils.issue import Issue, IssueSeverity


class ExceptionHandlingIssue(Issue):
    code = 'CDQ01'
    description = (
        '"{name}" does not contain any exception handling.\n\n'
        'Consider adding try-except blocks to handle potential errors and improve the robustness of your code.\n\n'
        '👋 Djangoly can handle this for you!\n\nRight-click the function name and select: "{command_title}"\n'
    )

    def __init__(self, view_name, lineno, col, severity=IssueSeverity.INFORMATION):
        parameters = {
            'name': view_name,
            'severity': severity,
            'command': "djangoly.analyzeExceptionHandling",
            'command_title': "Code boost: Improve Exception Handling"
        }
        super().__init__(lineno, col, parameters)
