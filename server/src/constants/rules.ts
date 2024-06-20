export const RULE_MESSAGES = {
    FUNCTION_TOO_SHORT: "Function name \"{name}\" is too short and must be more descriptive.",
    FUNCTION_NO_ACTION_WORD: "Function \"{name}\" does not start with a recognized action word.",
    FUNCTION_MIN_TWO_WORDS: "Function \"{name}\" must contain at least two words.",
    FUNCTION_TOO_LONG: "Function \"{name}\" exceeds the maximum length of {limit} lines.",
    VARIABLE_TOO_SHORT: "Variable \"{name}\" is too short and must be more descriptive.",
    BOOLEAN_NO_PREFIX: "Boolean variable \"{name}\" does not start with a conventional prefix.",
    BOOLEAN_NEGATIVE_PATTERN: "Boolean variable \"{name}\" has a negative naming pattern, which contradicts the positive naming convention.",
    OBJECT_KEY_TOO_SHORT: "Object key \"{name}\" is too short and must be more descriptive.",
    OBJECT_KEY_BOOLEAN_NO_PREFIX: "Object key \"{name}\" does not start with a conventional boolean prefix.",
    OBJECT_KEY_BOOLEAN_NEGATIVE_PATTERN: "Object key \"{name}\" has a negative naming pattern, which contradicts the positive naming convention.",
    CELERY_TASK_MISSING_DECORATORS: "Celery task \"{name}\" is missing required decorator(s): {decorators}.",
	CELERY_TASK_MISSING_CALLS: "Celery task \"{name}\" is missing required function call(s): {calls}.",
    THEME_SYSTEM_VIOLATION_HEXCODES: "Found a hardcoded hexcode value \"{value}\". Please use the team's theme system for colors and spacing."
};
