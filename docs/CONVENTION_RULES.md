# Djazzy Conventions

This document tracks all the validation and convention rules enforced by Djazzy. Each rule has a unique code, a description, and any additional relevant information.

## Code Quality-related Rules (CDQ)

| Rule Code    | Rule Name                              | Description                                                                                                       | Active by Default |
| ------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------- |
| [CDQ01](#CDQ01) | NO_EXCEPTION_HANDLER                   | Checks for the presence of exception handlers in views.                                                           | Yes               |
| [CDQ02](#CDQ02) | NAME_TOO_SHORT                         | Names (variables, functions, object properties) should be at least 3 characters long (excluding leading underscores). | Yes               |
| [CDQ03](#CDQ03) | FUNCTION_NAME_NO_VERB                  | Function names should include a verb to describe the action.                                                      | Yes               |
| [CDQ04](#CDQ04) | FUNCTION_TOO_LONG                      | Functions should not exceed a specified number of lines.                                                          | Yes               |
| [CDQ05](#CDQ05) | DJANGO_FIELD_CONVENTIONS               | Django fields should follow specific conventions.                                                                 | Yes               |
| [CDQ06](#CDQ06) | REDUNDANT_QUERY_METHODS                | Identifies redundant QuerySet method chains, such as `all().filter()` or `filter().all()`. Simplified queries avoid redundant operations. | Yes               |
| [CDQ07](#CDQ07) | SKINNY_VIEWS                           | Views should be skinny and delegate business logic to services or model methods.                                  | No               |

## Style-related Rules (STY)

| Rule Code    | Rule Name                              | Description                                                                                                       | Active by Default |
| ------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------- |
| [STY01](#STY01) | BOOLEAN_VARIABLE_PREFIX                | Boolean variables should use required prefixes.                                                                   | Yes               |
| [STY02](#STY02) | BOOLEAN_VARIABLE_POSITIVE_NAMING       | Boolean variables should use positive naming (avoid negative patterns).                                           | Yes               |
| [STY03](#STY03) | TEST_NAMING_PATTERN                    | Test names should follow the pattern `test_{result}_given\|when\|if_{conditions}`.                                           | Yes               |

## Security-related Rules (SEC)

| Rule Code    | Rule Name                              | Description                                                                                                       | Active by Default |
| ------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------- |
| [SEC01](#SEC01) | DEBUG_TRUE                             | DEBUG is set to True. Ensure it is False in production.                                                           | Yes               |
| [SEC02](#SEC02) | HARDCODED_SECRET_KEY                   | SECRET_KEY appears to be hardcoded. It is strongly recommended to store it in an environment variable.            | Yes               |
| [SEC03](#SEC03) | EMPTY_ALLOWED_HOSTS                    | ALLOWED_HOSTS is empty. This is not secure for production.                                                        | Yes               |
| [SEC04](#SEC04) | WILDCARD_ALLOWED_HOSTS                 | ALLOWED_HOSTS contains a wildcard '*'. This is not recommended for production.                                    | Yes               |
| [SEC05](#SEC05) | CSRF_COOKIE_SECURE_FALSE               | CSRF_COOKIE_SECURE is False. Set this to True to avoid transmitting the CSRF cookie over HTTP accidentally.       | Yes               |
| [SEC06](#SEC06) | SESSION_COOKIE_SECURE_FALSE            | SESSION_COOKIE_SECURE is False. Set this to True to avoid transmitting the session cookie over HTTP accidentally. | Yes               |
| [SEC07](#SEC07) | SECURE_SSL_REDIRECT_FALSE              | SECURE_SSL_REDIRECT is set to False. It should be True in production to enforce HTTPS.                            | Yes               |
| [SEC08](#SEC08) | X_FRAME_OPTIONS_NOT_SET                | X_FRAME_OPTIONS is not set to a valid value. It should be either 'DENY' or 'SAMEORIGIN' to prevent clickjacking.  | Yes               |
| [SEC09](#SEC09) | X_FRAME_OPTIONS_MISSING_MIDDLEWARE     | X_FRAME_OPTIONS is set, but the XFrameOptionsMiddleware is missing from the MIDDLEWARE list.                      | Yes               |
| [SEC10](#SEC10) | SECURE_HSTS_SECONDS_NOT_SET           | SECURE_HSTS_SECONDS is set to 0. Set it to a positive value to enforce HTTPS.                                     | Yes               |
| [SEC11](#SEC11) | SECURE_HSTS_INCLUDE_SUBDOMAINS_IGNORED | SECURE_HSTS_INCLUDE_SUBDOMAINS is True, but it has no effect because SECURE_HSTS_SECONDS is 0.                    | Yes               |
| [SEC12](#SEC12) | SECURE_HSTS_INCLUDE_SUBDOMAINS_FALSE   | SECURE_HSTS_INCLUDE_SUBDOMAINS is set to False. Set it to True for better security.                               | Yes               |
| [SEC13](#SEC13) | RAW_SQL_USAGE                          | Avoid using 'raw' queries to execute SQL directly, bypassing Django's ORM protections.                            | No                |
| [SEC14](#SEC14) | RAW_SQL_USAGE_WITH_CURSOR              | Avoid using 'connection.cursor()' to execute SQL directly, bypassing Django's ORM protections.                    | No                |