


class IssueSeverity:
    ERROR = 'ERROR'
    INFORMATION = 'INFORMATION'
    WARNING = 'WARNING'
    HINT = 'HINT'

class IssueDocLinks:
    DEBUG = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#debug'
    SECRET_KEY = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#secret-key'
    ALLOWED_HOSTS = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#allowed-hosts'
    CSRF_COOKIE_SECURE = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#csrf-cookie-secure'
    SESSION_COOKIE_SECURE = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#session-cookie-secure'
    RAW_SQL_USAGE = 'https://docs.djangoproject.com/en/5.0/topics/security/#sql-injection-protection'


class Issue(object):
    """
    Abstract class for issues.
    """
    code = ''
    description = ''
    severity = IssueSeverity.WARNING

    def __init__(self, lineno, col, parameters=None):
        self.parameters = {} if parameters is None else parameters
        self.col = col
        self.lineno = lineno

    @property
    def message(self):
        """
        Return issue message.
        """
        message = self.description.format(**self.parameters)
        return '{code} {message}'.format(code=self.code, message=message)
    
    @property
    def severity(self):
        """
        Return issue severity.
        """
        severity = self.severity.format(**self.parameters)
        return severity
