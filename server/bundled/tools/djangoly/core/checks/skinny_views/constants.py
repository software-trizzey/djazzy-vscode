from djangoly.core.utils.issue import Issue, IssueSeverity

class Messages:
    FAT_MODELS = 'Fat Models: Encapsulate logic in model methods. https://django-best-practices.readthedocs.io/en/latest/applications.html#make-em-fat'
    SERVICE_LAYER = 'Service Layer: Move complex workflows into service classes. https://github.com/HackSoftware/Django-Styleguide?tab=readme-ov-file#services'


class ScoreInterpretationEnum:
    COMPLEX = 'Complex'
    MODERATE = 'Moderate'
    SIMPLE = 'Simple'

class ScoreWeightEnum:
    COMPLEX = 75
    MODERATE = 40
    

class ComplexityIssue(Issue):
    code = 'CMP01' #TODO: align this to Djangoly code rule structure
    description = (
        '"{name}" seems overly complex with {line_count} lines and {operation_count} operations.\n\n'
        'Consider breaking it up and refactoring the business logic using one of the following approaches:\n\n'
        f'- {Messages.FAT_MODELS}\n\n'
        f'- {Messages.SERVICE_LAYER}\n\n'
    )

    def __init__(self, view_name, lineno, col, line_count, operation_count, severity=IssueSeverity.WARNING):
        parameters = {
            'name': view_name,
            'line_count': line_count,
            'operation_count': operation_count,
            'severity': severity
        }
        super().__init__(lineno, col, parameters)