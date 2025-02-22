from enum import Enum

class SecurityRules(Enum):
    DEBUG_TRUE = ("SEC01", "DEBUG is set to True. Ensure it is False in production.", "https://docs.djangoproject.com/en/5.0/ref/settings/#debug")

    HARDCODED_SECRET_KEY = ("SEC02", "SECRET_KEY appears to be hardcoded. It is strongly recommended to store it in an environment variable for better security.", "https://docs.djangoproject.com/en/5.0/ref/settings/#secret-key")

    EMPTY_ALLOWED_HOSTS = ("SEC03", "ALLOWED_HOSTS is empty. This is not secure for production.", "https://docs.djangoproject.com/en/5.0/ref/settings/#allowed-hosts")
    WILDCARD_ALLOWED_HOSTS = ("SEC04", "ALLOWED_HOSTS contains a wildcard '*'. This is not recommended for production.", "https://docs.djangoproject.com/en/5.0/ref/settings/#allowed-hosts")

    CSRF_COOKIE_SECURE_FALSE = ("SEC05", "CSRF_COOKIE_SECURE is False. Set this to True to avoid transmitting the CSRF cookie over HTTP accidentally.", "https://docs.djangoproject.com/en/5.0/ref/settings/#csrf-cookie-secure")
    SESSION_COOKIE_SECURE_FALSE = ("SEC06", "SESSION_COOKIE_SECURE is False. Set this to True to avoid transmitting the session cookie over HTTP accidentally.", "https://docs.djangoproject.com/en/5.0/ref/settings/#session-cookie-secure")

    SECURE_SSL_REDIRECT_FALSE = ("SEC07", "SECURE_SSL_REDIRECT is set to False. It should be True in production to enforce HTTPS.", "https://docs.djangoproject.com/en/5.0/ref/settings/#secure-ssl-redirect")

    X_FRAME_OPTIONS_NOT_SET = ("SEC08", "X_FRAME_OPTIONS is not set to a valid value. It should be either 'DENY' or 'SAMEORIGIN' to prevent clickjacking.", "https://docs.djangoproject.com/en/5.0/ref/settings/#x-frame-options")
    X_FRAME_OPTIONS_MISSING_MIDDLEWARE = ("SEC09", 'X_FRAME_OPTIONS is set, but the "django.middleware.clickjacking.XFrameOptionsMiddleware" is missing from the MIDDLEWARE list. Add the middleware to properly enforce X_FRAME_OPTIONS.', "https://docs.djangoproject.com/en/5.0/ref/settings/#x-frame-options")

    SECURE_HSTS_SECONDS_NOT_SET = ("SEC10", "SECURE_HSTS_SECONDS is set to 0. Set it to a positive value (e.g., 31536000 for 1 year) to enforce HTTPS.", "https://docs.djangoproject.com/en/5.0/ref/settings/#secure-hsts-seconds")
    SECURE_HSTS_INCLUDE_SUBDOMAINS_IGNORED = ("SEC11", "SECURE_HSTS_INCLUDE_SUBDOMAINS is set to True, but it has no effect because SECURE_HSTS_SECONDS is 0. Set SECURE_HSTS_SECONDS to a positive value to enable this.", "https://docs.djangoproject.com/en/5.0/ref/settings/#secure-hsts-include-subdomains")
    SECURE_HSTS_INCLUDE_SUBDOMAINS_FALSE = ("SEC12", "SECURE_HSTS_INCLUDE_SUBDOMAINS is set to False. Set it to True to apply HSTS to all subdomains for better security.", "https://docs.djangoproject.com/en/5.0/ref/settings/#secure-hsts-include-subdomains")

    RAW_SQL_USAGE = ("SEC13", "Avoid using 'raw' queries to execute raw SQL queries directly. This can bypass Django's ORM protections against SQL injection and reduce database portability. Consider using Django's ORM instead.", "https://docs.djangoproject.com/en/5.0/topics/db/sql/#performing-raw-queries")
    RAW_SQL_USAGE_WITH_CURSOR = ("SEC14", "Avoid using 'connection.cursor()' to execute raw SQL queries directly. This can bypass Django's ORM protections against SQL injection and reduce database portability. Consider using Django's ORM instead.", "https://docs.djangoproject.com/en/5.0/topics/db/sql/#performing-raw-queries")

    @property
    def code(self):
        return self.value[0]

    @property
    def description(self):
        return self.value[1]

    @property
    def doc_link(self):
        return self.value[2]
