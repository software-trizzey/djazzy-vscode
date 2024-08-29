
METHOD_NAMES = [
    "function",
    "django_model_method",
    "django_serializer_method",
    "django_view_method",
    "django_testcase_method",
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
    "count",
    "exists",
    "aggregate",
    "annotate",
    "values",
    "values_list",
    "first",
    "last",
    "latest",
    "earliest",
    "create",
    "update",
    "delete",
    "save",
    "bulk_create",
    "bulk_update",
    "bulk_delete",
    "select_related",
    "prefetch_related",
}

WRITE_METHODS = {
    "create",
    "update",
    "delete",
    "save",
    "bulk_create",
    "bulk_update",
}

BULK_METHODS = {
    "bulk_create",
    "bulk_update",
    "bulk_delete"
}

AGGREGATE_METHODS = {'annotate', 'count', 'first', 'last', 'latest', 'earliest'}

DEBUG = 'DEBUG'
SECRET_KEY = 'SECRET_KEY'
ALLOWED_HOSTS = 'ALLOWED_HOSTS'
WILD_CARD = '*'
CSRF_COOKIE_SECURE = 'CSRF_COOKIE_SECURE'
SESSION_COOKIE = 'SESSION_COOKIE_SECURE'


DJANGO_COMPONENTS = {
    'model': ['Model', 'BaseModel'],
    'serializer': ['Serializer', 'BaseSerializer'],
    'view': ['View', 'BaseView'],
    'testcase': ['TestCase', 'BaseTestCase']
}