export const RULE_MESSAGES = {
    FUNCTION_TOO_SHORT: "Function name \"{name}\" is too short and must be more descriptive.",
    FUNCTION_NO_ACTION_WORD: "Function \"{name}\" does not start with a recognized verb.",
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


// TODO: this is currently incomplete but will begin adding more rules here
export enum RuleCodes {
    COMPLEX_VIEW = "CMP01",
    NO_EXCEPTION_HANDLER = "CDQ01",
    NPLUSONE = "PER01",
}