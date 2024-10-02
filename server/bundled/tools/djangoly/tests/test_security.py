import unittest
import textwrap
from unittest.mock import patch

from djangoly.core.utils.issue import IssueSeverity
from djangoly.core.checks.security.checker import SecurityCheckService
from djangoly.core.checks.security.security_rules import SecurityRules


class TestSecurityCheckService(unittest.TestCase):

    @patch('djangoly.core.utils.log.LOGGER')
    def test_debug_true_detected(self, mock_logger):
        source_code = "DEBUG = True"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.DEBUG_TRUE.code)
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn(SecurityRules.DEBUG_TRUE.description, issues[0].message)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_debug_false_not_detected(self, mock_logger):
        source_code = "DEBUG = False"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_secret_key_hardcoded_detected(self, mock_logger):
        source_code = "SECRET_KEY = 'supersecretkey'"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.HARDCODED_SECRET_KEY.code)
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn('SECRET_KEY appears to be hardcoded', issues[0].message)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_secret_key_using_env_not_detected(self, mock_logger):
        source_code = "SECRET_KEY = os.getenv('SECRET_KEY')"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_secret_key_using_dotenv_not_detected(self, mock_logger):
        source_code = "SECRET_KEY = dotenv.get_key('.env', 'SECRET_KEY')"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_secret_key_using_django_environ_not_detected(self, mock_logger):
        source_code = "SECRET_KEY = env('SECRET_KEY')"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_secret_key_using_django_environ_str_not_detected(self, mock_logger):
        source_code = "SECRET_KEY = env.str('SECRET_KEY')"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_secret_key_hardcoded_detected_with_third_party(self, mock_logger):
        source_code = textwrap.dedent("""
        import dotenv
        SECRET_KEY = 'supersecretkey'
        """)
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.HARDCODED_SECRET_KEY.code)
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn(SecurityRules.HARDCODED_SECRET_KEY.description, issues[0].message)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_secret_key_using_os_environ_get_detected(self, mock_logger):
        source_code = "SECRET_KEY = os.environ['SECRET_KEY']"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_allowed_hosts_wildcard_detected(self, mock_logger):
        source_code = "ALLOWED_HOSTS = ['*']"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.WILDCARD_ALLOWED_HOSTS.code)
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn(SecurityRules.WILDCARD_ALLOWED_HOSTS.description, issues[0].message)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_allowed_hosts_specific_domain_not_detected(self, mock_logger):
        source_code = "ALLOWED_HOSTS = ['mydomain.com']"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_raw_sql_query_using_model_manager_detected(self, mock_logger):
        source_code = "User.objects.raw('SELECT * FROM auth_user')"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.RAW_SQL_USAGE.code)
        self.assertEqual(issues[0].severity, IssueSeverity.INFORMATION)
        self.assertIn(SecurityRules.RAW_SQL_USAGE.description, issues[0].message)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_no_raw_sql_query_not_detected(self, mock_logger):
        source_code = "User.objects.filter(username='testuser')"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    def test_raw_sql_query_with_cursor_detected(self):
        source_code = """from django.db import connection\nconnection.cursor()"""
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.RAW_SQL_USAGE_WITH_CURSOR.code)
        self.assertEqual(issues[0].severity, IssueSeverity.INFORMATION)
        self.assertIn(SecurityRules.RAW_SQL_USAGE_WITH_CURSOR.description, issues[0].message)

    def test_no_raw_sql_with_cursor_not_detected(self):
        source_code = """from django.db import connection\nconnection.cursor().close()"""
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_csrf_cookie_secure_false_detected(self, mock_logger):
        source_code = "CSRF_COOKIE_SECURE = False"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.CSRF_COOKIE_SECURE_FALSE.code)
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn(SecurityRules.CSRF_COOKIE_SECURE_FALSE.description, issues[0].message)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_csrf_cookie_secure_true_not_detected(self, mock_logger):
        source_code = "CSRF_COOKIE_SECURE = True"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_session_cookie_secure_false_detected(self, mock_logger):
        source_code = "SESSION_COOKIE_SECURE = False"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.SESSION_COOKIE_SECURE_FALSE.code)
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn(SecurityRules.SESSION_COOKIE_SECURE_FALSE.description, issues[0].message)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_session_cookie_secure_true_not_detected(self, mock_logger):
        source_code = "SESSION_COOKIE_SECURE = True"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_secure_ssl_redirect_false_detected(self, mock_logger):
        source_code = "SECURE_SSL_REDIRECT = False"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.SECURE_SSL_REDIRECT_FALSE.code)
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn(SecurityRules.SECURE_SSL_REDIRECT_FALSE.description, issues[0].message)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_secure_ssl_redirect_true_not_detected(self, mock_logger):
        source_code = "SECURE_SSL_REDIRECT = True"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_x_frame_options_not_set_detected(self, mock_logger):
        source_code = textwrap.dedent(
            """
            X_FRAME_OPTIONS = ''
            MIDDLEWARE = ['django.middleware.clickjacking.XFrameOptionsMiddleware']
            """
        )
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.X_FRAME_OPTIONS_NOT_SET.code)
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn(SecurityRules.X_FRAME_OPTIONS_NOT_SET.description, issues[0].message)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_x_frame_options_set_to_invalid_value_should_raise_issue(self, mock_logger):
        source_code = textwrap.dedent(
            """
            X_FRAME_OPTIONS = 'hello'
            MIDDLEWARE = ['django.middleware.clickjacking.XFrameOptionsMiddleware']
            """
        )
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.X_FRAME_OPTIONS_NOT_SET.code)
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn(SecurityRules.X_FRAME_OPTIONS_NOT_SET.description, issues[0].message)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_x_frame_options_with_sameorigin_value_should_not_create_issue(self, mock_logger):
        source_code = textwrap.dedent(
            """
            X_FRAME_OPTIONS = 'SAMEORIGIN'
            MIDDLEWARE = ['django.middleware.clickjacking.XFrameOptionsMiddleware']
            """
        )
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_x_frame_options_with_deny_value_should_not_create_issue(self, mock_logger):
        source_code = textwrap.dedent(
            """
            X_FRAME_OPTIONS = 'DENY'
            MIDDLEWARE = ['django.middleware.clickjacking.XFrameOptionsMiddleware']
            """
        )
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)
    
    @patch('djangoly.core.utils.log.LOGGER')
    def test_x_frame_options_without_middleware_should_create_issue(self, mock_logger):
        """
        The "django.middleware.clickjacking.XFrameOptionsMiddleware" middleware should be present if X_FRAME_OPTIONS is set.
        """
        source_code = textwrap.dedent(
            """
            X_FRAME_OPTIONS = 'DENY'
            MIDDLEWARE = [
                'django.middleware.security.SecurityMiddleware',
                'django.middleware.common.CommonMiddleware'
            ]
            """
        )
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.X_FRAME_OPTIONS_MISSING_MIDDLEWARE.code)
        self.assertIn(SecurityRules.X_FRAME_OPTIONS_MISSING_MIDDLEWARE.description, issues[0].message)


    @patch('djangoly.core.utils.log.LOGGER')
    def test_secure_hsts_seconds_with_zero_value_raises_an_issue(self, mock_logger):
        source_code = "SECURE_HSTS_SECONDS = 0"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.SECURE_HSTS_SECONDS_NOT_SET.code)
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn(SecurityRules.SECURE_HSTS_SECONDS_NOT_SET.description, issues[0].message)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_secure_hsts_seconds_set_properly_and_issue_not_detected(self, mock_logger):
        source_code = "SECURE_HSTS_SECONDS = 31536000"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_secure_hsts_include_subdomains_false_and_issue_detected(self, mock_logger):
        source_code = textwrap.dedent(
            """
            SECURE_HSTS_SECONDS = 31536000
            SECURE_HSTS_INCLUDE_SUBDOMAINS = False
            """
        )
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].code, SecurityRules.SECURE_HSTS_INCLUDE_SUBDOMAINS_FALSE.code)
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn(SecurityRules.SECURE_HSTS_INCLUDE_SUBDOMAINS_FALSE.description, issues[0].message)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_secure_hsts_include_subdomains_true_and_issue_not_detected(self, mock_logger):
        source_code = textwrap.dedent(
            """
            SECURE_HSTS_SECONDS = 31536000
            SECURE_HSTS_INCLUDE_SUBDOMAINS = True
            """
        )
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('djangoly.core.utils.log.LOGGER')
    def test_secure_hsts_include_subdomains_true_with_hsts_seconds_zero_detected(self, mock_logger):
        source_code = textwrap.dedent(
            """
            SECURE_HSTS_SECONDS = 0
            SECURE_HSTS_INCLUDE_SUBDOMAINS = True
            """
        )
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 2)  # Both HSTS_SECONDS and HSTS_INCLUDE_SUBDOMAINS should be flagged
        self.assertEqual(issues[0].code, SecurityRules.SECURE_HSTS_SECONDS_NOT_SET.code)
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn(SecurityRules.SECURE_HSTS_SECONDS_NOT_SET.description, issues[0].message)
        self.assertEqual(issues[1].code, SecurityRules.SECURE_HSTS_INCLUDE_SUBDOMAINS_IGNORED.code)
        self.assertEqual(issues[1].severity, IssueSeverity.WARNING)
        self.assertIn(
            SecurityRules.SECURE_HSTS_INCLUDE_SUBDOMAINS_IGNORED.description,
            issues[1].message
        )



if __name__ == '__main__':
    unittest.main()
