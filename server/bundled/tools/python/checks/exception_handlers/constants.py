from issue import Issue, IssueSeverity


class ExceptionHandlingIssue(Issue):
    code = 'CDQ01'
    description = (
        '"{name}" does not contain any exception handling.\n\n'
        'Consider adding try-except blocks to handle potential errors and improve the robustness of your code.\n\n'
        'To quickly address this issue, right-click the function name and select "{command_title}" from the context menu:\n'
        'Command: {command}'
    )

    def __init__(self, view_name, lineno, col, severity=IssueSeverity.WARNING):
        parameters = {
            'name': view_name,
            'severity': severity,
            'command': "djangoly.analyzeExceptionHandling",
            'command_title': "Djangoly: Analyze Exception Handling"
        }
        super().__init__(lineno, col, parameters)
