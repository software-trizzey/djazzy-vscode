from typing import Dict
from enum import Enum

class RuleCode(Enum):
    # Security-related Rules (SEC)
    SEC01 = "SEC01"
    SEC02 = "SEC02"
    SEC03 = "SEC03"
    SEC04 = "SEC04"
    SEC05 = "SEC05"
    SEC06 = "SEC06"
    SEC07 = "SEC07"
    SEC08 = "SEC08"
    SEC09 = "SEC09"
    SEC10 = "SEC10"
    SEC11 = "SEC11"
    SEC12 = "SEC12"
    SEC13 = "SEC13"
    SEC14 = "SEC14"

    # Code Quality-related Rules (CDQ)
    CDQ01 = "CDQ01"
    CDQ02 = "CDQ02"
    CDQ03 = "CDQ03"
    CDQ04 = "CDQ04"
    CDQ05 = "CDQ05"
    CDQ06 = "CDQ06"
    CDQ07 = "CDQ07"

    # Style-related Rules (STY)
    STY01 = "STY01"
    STY02 = "STY02"
    STY03 = "STY03"


class Rule:
    def __init__(self, code: RuleCode, name: str, description: str, additional_info: str = None):
        self.code = code
        self.name = name
        self.description = description
        self.additional_info = additional_info


RULES: Dict[RuleCode, Rule] = {
    # Security-related Rules (SEC)
    RuleCode.SEC01: Rule(
        code=RuleCode.SEC01,
        name="DEBUG_TRUE",
        description="DEBUG is set to True. Ensure it is False in production."
    ),
    RuleCode.SEC02: Rule(
        code=RuleCode.SEC02,
        name="HARDCODED_SECRET_KEY",
        description="SECRET_KEY appears to be hardcoded. It is strongly recommended to store it in an environment variable."
    ),
    RuleCode.SEC03: Rule(
        code=RuleCode.SEC03,
        name="EMPTY_ALLOWED_HOSTS",
        description="ALLOWED_HOSTS is empty. This is not secure for production."
    ),
    RuleCode.SEC04: Rule(
        code=RuleCode.SEC04,
        name="WILDCARD_ALLOWED_HOSTS",
        description="ALLOWED_HOSTS contains a wildcard '*'. This is not recommended for production."
    ),
    RuleCode.SEC05: Rule(
        code=RuleCode.SEC05,
        name="CSRF_COOKIE_SECURE_FALSE",
        description="CSRF_COOKIE_SECURE is False. Set this to True to avoid transmitting the CSRF cookie over HTTP accidentally."
    ),
    RuleCode.SEC06: Rule(
        code=RuleCode.SEC06,
        name="SESSION_COOKIE_SECURE_FALSE",
        description="SESSION_COOKIE_SECURE is False. Set this to True to avoid transmitting the session cookie over HTTP accidentally."
    ),
    RuleCode.SEC07: Rule(
        code=RuleCode.SEC07,
        name="SECURE_SSL_REDIRECT_FALSE",
        description="SECURE_SSL_REDIRECT is set to False. It should be True in production to enforce HTTPS."
    ),
    RuleCode.SEC08: Rule(
        code=RuleCode.SEC08,
        name="X_FRAME_OPTIONS_NOT_SET",
        description="X_FRAME_OPTIONS is not set to a valid value. It should be either 'DENY' or 'SAMEORIGIN' to prevent clickjacking."
    ),
    RuleCode.SEC09: Rule(
        code=RuleCode.SEC09,
        name="X_FRAME_OPTIONS_MISSING_MIDDLEWARE",
        description="X_FRAME_OPTIONS is set, but the XFrameOptionsMiddleware is missing from the MIDDLEWARE list."
    ),
    RuleCode.SEC10: Rule(
        code=RuleCode.SEC10,
        name="SECURE_HSTS_SECONDS_NOT_SET",
        description="SECURE_HSTS_SECONDS is set to 0. Set it to a positive value to enforce HTTPS."
    ),
    RuleCode.SEC11: Rule(
        code=RuleCode.SEC11,
        name="SECURE_HSTS_INCLUDE_SUBDOMAINS_IGNORED",
        description="SECURE_HSTS_INCLUDE_SUBDOMAINS is True, but it has no effect because SECURE_HSTS_SECONDS is 0."
    ),
    RuleCode.SEC12: Rule(
        code=RuleCode.SEC12,
        name="SECURE_HSTS_INCLUDE_SUBDOMAINS_FALSE",
        description="SECURE_HSTS_INCLUDE_SUBDOMAINS is set to False. Set it to True for better security."
    ),
    RuleCode.SEC13: Rule(
        code=RuleCode.SEC13,
        name="RAW_SQL_USAGE",
        description="Avoid using 'raw' queries to execute SQL directly, bypassing Django's ORM protections."
    ),
    RuleCode.SEC14: Rule(
        code=RuleCode.SEC14,
        name="RAW_SQL_USAGE_WITH_CURSOR",
        description="Avoid using 'connection.cursor()' to execute SQL directly, bypassing Django's ORM protections."
    ),

    # Code Quality-related Rules (CDQ)
    RuleCode.CDQ01: Rule(
        code=RuleCode.CDQ01,
        name="NO_EXCEPTION_HANDLER",
        description="Checks for the presence of exception handlers in views."
    ),
    RuleCode.CDQ02: Rule(
        code=RuleCode.CDQ02,
        name="NAME_TOO_SHORT",
        description="Names (variables, functions, object properties) should be at least 3 characters long (excluding leading underscores).",
        additional_info="Applies to all variables, function names, object properties, etc. Excludes 'id' for object properties."
    ),
    RuleCode.CDQ03: Rule(
        code=RuleCode.CDQ03,
        name="FUNCTION_NAME_NO_VERB",
        description="Function names should include a verb to describe the action.",
        additional_info="Applies to regular functions, Django model methods, serializer methods, view methods, and testcase methods."
    ),
    RuleCode.CDQ04: Rule(
        code=RuleCode.CDQ04,
        name="FUNCTION_TOO_LONG",
        description="Functions should not exceed a specified number of lines.",
        additional_info="The maximum allowed length is configurable."
    ),
    RuleCode.CDQ05: Rule(
        code=RuleCode.CDQ05,
        name="DJANGO_FIELD_CONVENTIONS",
        description="Django fields should follow specific conventions."
    ),
    RuleCode.CDQ06: Rule(
        code=RuleCode.CDQ06,
        name="REDUNDANT_QUERY_METHODS",
        description="Identifies redundant QuerySet method chains, such as `all().filter()` or `filter().all()`. Simplified queries avoid redundant operations."
    ),
    RuleCode.CDQ07: Rule(
        code=RuleCode.CDQ07,
        name="SKINNY_VIEWS",
        description="Views should be skinny and delegate business logic to services or model methods."
    ),

    # Style-related Rules (STY)
    RuleCode.STY01: Rule(
        code=RuleCode.STY01,
        name="BOOLEAN_VARIABLE_PREFIX",
        description="Boolean variables should use required prefixes.",
        additional_info="Prefixes are configurable in settings."
    ),
    RuleCode.STY02: Rule(
        code=RuleCode.STY02,
        name="BOOLEAN_VARIABLE_POSITIVE_NAMING",
        description="Boolean variables should use positive naming (avoid negative patterns)."
    ),
    RuleCode.STY03: Rule(
        code=RuleCode.STY03,
        name="TEST_NAMING_CONVENTION",
        description="Test names should follow the pattern `test_{result}_given_{conditions}`."
    ),
}

