from djazzy.core.lib.issue import Issue, IssueSeverity
from djazzy.core.lib.rules import RuleCode



class ExceptionHandlingIssue(Issue):
    code = RuleCode.CDQ01.value
    description = (
        '"{name}" does not contain any exception handling.\n\n'
        'Consider adding try-except blocks to handle potential errors and improve the robustness of your code.\n\n'
        '👋 Djazzy can handle this for you!\n\nRight-click the function name and select: "{command_title}"\n'
    )

    def __init__(self, view_name, lineno, col, severity=IssueSeverity.INFORMATION):
        parameters = {
            'name': view_name,
            'command': "djazzy.analyzeExceptionHandling",
            'command_title': "Code boost: Improve Exception Handling"
        }
        super().__init__(lineno, col, severity, parameters)
