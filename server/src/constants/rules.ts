export const RULE_MESSAGES = {
    FUNCTION_TOO_SHORT: "Function name \"{name}\" is too short and must be more descriptive.",
    FUNCTION_NAME_NO_VERB: "Function \"{name}\" does not start with a recognized verb.",
    FUNCTION_MIN_TWO_WORDS: "Function \"{name}\" must contain at least two words.",
    FUNCTION_TOO_LONG: "Function \"{name}\" exceeds the maximum length of {limit} lines.",
    NAME_TOO_SHORT: "\"{name}\" is too short and must be more descriptive.",
    BOOLEAN_NO_PREFIX: "Boolean variable \"{name}\" does not start with a conventional prefix.",
    BOOLEAN_NEGATIVE_PATTERN: "Boolean variable \"{name}\" has a negative naming pattern, which contradicts the positive naming convention.",
    OBJECT_KEY_TOO_SHORT: "Object key \"{name}\" is too short and must be more descriptive.",
    OBJECT_KEY_BOOLEAN_NO_PREFIX: "Object key \"{name}\" does not start with a conventional boolean prefix.",
    OBJECT_KEY_BOOLEAN_NEGATIVE_PATTERN: "Object key \"{name}\" has a negative naming pattern, which contradicts the positive naming convention.",
    CELERY_TASK_MISSING_DECORATORS: "Celery task \"{name}\" is missing required decorator(s): {decorators}.",
	CELERY_TASK_MISSING_CALLS: "Celery task \"{name}\" is missing required function call(s): {calls}.",
    THEME_SYSTEM_VIOLATION_HEXCODES: "Found a hardcoded hexcode value \"{value}\". Please use the team's theme system for colors and spacing.",
    URL_PATTERN_HARDCODED: "Avoid using hardcoded URLs in URL patterns",
    URL_PATTERN_UNNAMED: "Use named URL patterns for better reversibility and readability (e.g. 'name=user-detail')",
    URL_PATTERN_REGEX: "Prefer 'path()' over 're_path()' or 'url()' when possible",
    URL_PATTERN_INVALID_PARAMETER: "Use angle brackets '<>' for URL parameters",
    URL_PATTERN_INCONSISTENT_TRAILING_SLASH: "Use consistent trailing slashes in URL patterns",
    URL_PATTERN_MISSING_VIEW: "Ensure view is provided for URL pattern",
    URL_PATTERN_MISSING_ROUTE: "URL pattern is missing a route",
};


export enum RuleCodes {
    // Security-related rules (SEC)
    DEBUG_TRUE = "SEC01",
    HARDCODED_SECRET_KEY = "SEC02",
    EMPTY_ALLOWED_HOSTS = "SEC03",
    WILDCARD_ALLOWED_HOSTS = "SEC04",
    CSRF_COOKIE_SECURE_FALSE = "SEC05",
    SESSION_COOKIE_SECURE_FALSE = "SEC06",
    SECURE_SSL_REDIRECT_FALSE = "SEC07",
    X_FRAME_OPTIONS_NOT_SET = "SEC08",
    X_FRAME_OPTIONS_MISSING_MIDDLEWARE = "SEC09",
    SECURE_HSTS_SECONDS_NOT_SET = "SEC10",
    SECURE_HSTS_INCLUDE_SUBDOMAINS_IGNORED = "SEC11",
    SECURE_HSTS_INCLUDE_SUBDOMAINS_FALSE = "SEC12",
    RAW_SQL_USAGE = "SEC13",
    RAW_SQL_USAGE_WITH_CURSOR = "SEC14",

    // Complexity-related rules (CMP)
    COMPLEX_VIEW = "CMP01",
    FUNCTION_COMPLEXITY = "CMP02",

    // Code Quality-related rules (CDQ)
    NO_EXCEPTION_HANDLER = "CDQ01",
    VARIABLE_NAME_TOO_SHORT = "CDQ02",
    OBJECT_PROPERTY_NAME_TOO_SHORT = "CDQ03",
    FUNCTION_NAME_TOO_SHORT = "CDQ04",
    FUNCTION_NAME_NO_VERB = "CDQ05",
    FUNCTION_TOO_LONG = "CDQ06",
    CLASS_NAME_CONVENTION = "CDQ07",
    LIST_NAME_CONVENTION = "CDQ08",
    DICTIONARY_VALIDATION = "CDQ09",
    FOR_LOOP_TARGET_VALIDATION = "CDQ010",
    DJANGO_MODEL_FIELD_NAMING = "CDQ011",
    DJANGO_SERIALIZER_FIELD_NAMING = "CDQ12",
    DJANGO_FIELD_CONVENTIONS = "CDQ13",
    COMMENT_VALIDATION = "CDQ14",
    CELERY_TASK_VALIDATION = "CDQ16",

    // Style-related rules (STY)
    BOOLEAN_VARIABLE_PREFIX = "STY01",
    BOOLEAN_VARIABLE_POSITIVE_NAMING = "STY02",
    BOOLEAN_PROPERTY_PREFIX = "STY03",
    BOOLEAN_PROPERTY_POSITIVE_NAMING = "STY04",

    // Configuration-related rules (CFG)
    RESERVED_SYMBOL_HANDLING = "CFG01",

    // Performance-related rules (PER)
    NPLUSONE = "PER01",
}