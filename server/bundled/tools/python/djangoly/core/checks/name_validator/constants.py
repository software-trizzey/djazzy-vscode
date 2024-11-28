VARIABLES_TO_IGNORE = [
    "ID", "PK", "DEBUG", "USE_I18N", "USE_L10N", "USE_TZ",
    "CSRF_COOKIE_SECURE", "SESSION_COOKIE_SECURE", "SECURE_SSL_REDIRECT",
    "SECURE_HSTS_INCLUDE_SUBDOMAINS"
]

RULE_MESSAGES = {
    "NAME_TOO_SHORT": "Variable name '{name}' is too short.",
    "BOOLEAN_NO_PREFIX": "Boolean variable '{name}' should have a proper prefix.",
    "BOOLEAN_NEGATIVE_PATTERN": "Boolean variable '{name}' should not have a negative pattern.",
    "FUNCTION_NAME_NO_VERB": "Function name '{name}' should start with a verb.",
    "FUNCTION_TOO_SHORT": "Function name '{name}' is too short.",
    "FUNCTION_TOO_LONG": "Function '{name}' is too long. Limit is {limit} lines.",
}