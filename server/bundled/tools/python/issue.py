class IssueSeverity:
    ERROR = 'ERROR'
    WARNING = 'WARNING'
    INFORMATION = 'INFORMATION'
    HINT = 'HINT'

class IssueDocLinks:
    DEBUG = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#debug'
    SECRET_KEY = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#secret-key'
    ALLOWED_HOSTS = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#allowed-hosts'
    CSRF_COOKIE_SECURE = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#csrf-cookie-secure'
    SESSION_COOKIE_SECURE = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#session-cookie-secure'
    RAW_SQL_USAGE = 'https://docs.djangoproject.com/en/5.0/topics/security/#sql-injection-protection'
    SECURE_SSL_REDIRECT = 'https://docs.djangoproject.com/en/5.0/ref/settings/#secure-ssl-redirect'
    X_FRAME_OPTIONS = 'https://docs.djangoproject.com/en/5.0/ref/clickjacking/'
    SECURE_HSTS_SECONDS = 'https://docs.djangoproject.com/en/5.0/ref/settings/#secure-hsts-seconds'
    SECURE_HSTS_INCLUDE_SUBDOMAINS = 'https://docs.djangoproject.com/en/5.0/ref/settings/#secure-hsts-include-subdomains'
    QUERYSET_API = 'https://docs.djangoproject.com/en/5.0/ref/models/querysets/'


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
        if 'severity' in self.parameters:
            self.severity = self.parameters['severity']

    @property
    def message(self):
        """
        Return issue message.
        """
        message = self.description.format(**self.parameters)
        return message