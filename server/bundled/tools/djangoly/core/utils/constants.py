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

DEBUG = 'DEBUG'
SECRET_KEY = 'SECRET_KEY'
ALLOWED_HOSTS = 'ALLOWED_HOSTS'
WILD_CARD = '*'
CSRF_COOKIE_SECURE = 'CSRF_COOKIE_SECURE'
SESSION_COOKIE = 'SESSION_COOKIE_SECURE'
SECURE_SSL_REDIRECT = 'SECURE_SSL_REDIRECT'
X_FRAME_OPTIONS = 'X_FRAME_OPTIONS'
SECURE_HSTS_SECONDS = 'SECURE_HSTS_SECONDS'
SECURE_HSTS_INCLUDE_SUBDOMAINS = 'SECURE_HSTS_INCLUDE_SUBDOMAINS'
MIDDLEWARE_LIST = 'MIDDLEWARE'