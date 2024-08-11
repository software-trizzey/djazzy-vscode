
METHOD_NAMES = [
    "function",
    "django_model_method",
    "django_serializer_method",
    "django_view_method",
    "django_testcase_method",
]

QUERY_METHODS = [
    "all", "filter", "get", "count", "exists", "aggregate",
    "annotate", "values", "values_list", "first", "last",
]

OPTIMIZATION_METHODS = {"select_related", "prefetch_related"}

DJANGO_IGNORE_FUNCTIONS = {
    "save": True,
    "delete": True,
    "__str__": True,
    "clean": True,
    "get_absolute_url": True,
    "create": True,
    "update": True,
    "validate": True,
    "get_queryset": True,
    "get": True,
    "post": True,
    "put": True,
    "get_context_data": True,
    "validate_<field_name>": True,
    "delete": True,
    "perform_create": True,
}

REVERSE_FOREIGN_KEY_PATTERN = r"\.[\w]+_set\."
FOREIGN_KEY_OR_ONE_TO_ONE_PATTERN = r"\.[\w]+\."

RELATED_FIELD_PATTERNS = [
    REVERSE_FOREIGN_KEY_PATTERN,
    FOREIGN_KEY_OR_ONE_TO_ONE_PATTERN
]

QUERY_METHODS = {
    "filter",
    "all",
    "get",
    "exclude",
    "values",
    "values_list",
    "first",
    "last",
    "count",
    "iterator",
}

AGGREGATE_METHODS = ["Count", "Sum", "Avg", "Max", "Min"]


DEBUG = 'DEBUG'
SECRET_KEY = 'SECRET_KEY'
ALLOWED_HOSTS = 'ALLOWED_HOSTS'
WILD_CARD = '*'
CSRF_COOKIE_SECURE = 'CSRF_COOKIE_SECURE'
SESSION_COOKIE = 'SESSION_COOKIE_SECURE'

class IssueSeverity:
    ERROR = 'ERROR'
    INFORMATION = 'INFORMATION'
    WARNING = 'WARNING'

class IssueDocLinks:
    DEBUG = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#debug'
    SECRET_KEY = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#secret-key'
    ALLOWED_HOSTS = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#allowed-hosts'
    CSRF_COOKIE_SECURE = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#csrf-cookie-secure'
    SESSION_COOKIE_SECURE = 'https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/#session-cookie-secure'

DJANGO_COMPONENTS = {
    'model': ['Model', 'BaseModel'],
    'serializer': ['Serializer', 'BaseSerializer'],
    'view': ['View', 'BaseView'],
    'testcase': ['TestCase', 'BaseTestCase']
}