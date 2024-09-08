import unittest
import textwrap
from unittest.mock import patch
from issue import IssueSeverity
from checks.security import SecurityCheckService, RawSqlIssueMessages


class TestSecurityCheckService(unittest.TestCase):

    @patch('log.LOGGER')
    def test_debug_true_detected(self, mock_logger):
        source_code = "DEBUG = True"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].issue_type, 'debug_true')
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn('DEBUG is set to True', issues[0].message)

    @patch('log.LOGGER')
    def test_debug_false_not_detected(self, mock_logger):
        source_code = "DEBUG = False"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
    def test_secret_key_hardcoded_detected(self, mock_logger):
        source_code = "SECRET_KEY = 'supersecretkey'"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].issue_type, 'hardcoded_secret_key')
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn('SECRET_KEY appears to be hardcoded', issues[0].message)

    @patch('log.LOGGER')
    def test_secret_key_using_env_not_detected(self, mock_logger):
        source_code = "SECRET_KEY = os.getenv('SECRET_KEY')"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
    def test_allowed_hosts_wildcard_detected(self, mock_logger):
        source_code = "ALLOWED_HOSTS = ['*']"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].issue_type, 'wildcard_allowed_hosts')
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn('ALLOWED_HOSTS contains a wildcard', issues[0].message)

    @patch('log.LOGGER')
    def test_allowed_hosts_specific_domain_not_detected(self, mock_logger):
        source_code = "ALLOWED_HOSTS = ['mydomain.com']"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
    def test_raw_sql_query_using_model_manager_detected(self, mock_logger):
        source_code = "User.objects.raw('SELECT * FROM auth_user')"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].issue_type, 'raw_sql_usage')
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn(RawSqlIssueMessages.RAW_SQL_USAGE, issues[0].message)

    @patch('log.LOGGER')
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
        self.assertEqual(issues[0].issue_type, 'raw_sql_usage')
        self.assertEqual(issues[0].severity, IssueSeverity.INFORMATION)
        self.assertIn(RawSqlIssueMessages.RAW_SQL_USAGE_WITH_CURSOR, issues[0].message)

    def test_no_raw_sql_with_cursor_not_detected(self):
        source_code = """from django.db import connection\nconnection.cursor().close()"""
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
    def test_csrf_cookie_secure_false_detected(self, mock_logger):
        source_code = "CSRF_COOKIE_SECURE = False"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].issue_type, 'csrf_cookie_secure_false')
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn('CSRF_COOKIE_SECURE is False', issues[0].message)

    @patch('log.LOGGER')
    def test_csrf_cookie_secure_true_not_detected(self, mock_logger):
        source_code = "CSRF_COOKIE_SECURE = True"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
    def test_session_cookie_secure_false_detected(self, mock_logger):
        source_code = "SESSION_COOKIE_SECURE = False"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].issue_type, 'session_cookie_secure_false')
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn('SESSION_COOKIE_SECURE is False', issues[0].message)

    @patch('log.LOGGER')
    def test_session_cookie_secure_true_not_detected(self, mock_logger):
        source_code = "SESSION_COOKIE_SECURE = True"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
    def test_secure_ssl_redirect_false_detected(self, mock_logger):
        source_code = "SECURE_SSL_REDIRECT = False"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].issue_type, 'secure_ssl_redirect_false')
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn('SECURE_SSL_REDIRECT is set to False', issues[0].message)

    @patch('log.LOGGER')
    def test_secure_ssl_redirect_true_not_detected(self, mock_logger):
        source_code = "SECURE_SSL_REDIRECT = True"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
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
        self.assertEqual(issues[0].issue_type, 'x_frame_options_not_set')
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn('X_FRAME_OPTIONS is not set', issues[0].message)

    @patch('log.LOGGER')
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
        self.assertEqual(issues[0].issue_type, 'x_frame_options_not_set')
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn('X_FRAME_OPTIONS is not set', issues[0].message)

    @patch('log.LOGGER')
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

    @patch('log.LOGGER')
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
    
    @patch('log.LOGGER')
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
        self.assertEqual(issues[0].issue_type, 'x_frame_options_middleware_missing')
        self.assertIn('X_FRAME_OPTIONS is set, but the "django.middleware.clickjacking.XFrameOptionsMiddleware" is missing', issues[0].message)


    @patch('log.LOGGER')
    def test_secure_hsts_seconds_with_zero_value_raises_an_issue(self, mock_logger):
        source_code = "SECURE_HSTS_SECONDS = 0"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].issue_type, 'secure_hsts_seconds_not_set')
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn('SECURE_HSTS_SECONDS is set to 0', issues[0].message)

    @patch('log.LOGGER')
    def test_secure_hsts_seconds_set_properly_and_issue_not_detected(self, mock_logger):
        source_code = "SECURE_HSTS_SECONDS = 31536000"
        service = SecurityCheckService(source_code)
        
        service.run_security_checks()
        
        issues = service.get_security_issues()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
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
        self.assertEqual(issues[0].issue_type, 'secure_hsts_include_subdomains_false')
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn('SECURE_HSTS_INCLUDE_SUBDOMAINS is set to False', issues[0].message)

    @patch('log.LOGGER')
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

    @patch('log.LOGGER')
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
        self.assertEqual(issues[0].issue_type, 'secure_hsts_seconds_not_set')
        self.assertEqual(issues[0].severity, IssueSeverity.WARNING)
        self.assertIn('SECURE_HSTS_SECONDS is set to 0', issues[0].message)
        self.assertEqual(issues[1].issue_type, 'secure_hsts_include_subdomains_ignored')
        self.assertEqual(issues[1].severity, IssueSeverity.WARNING)
        self.assertIn(
            'SECURE_HSTS_INCLUDE_SUBDOMAINS is set to True, but it has no effect because SECURE_HSTS_SECONDS is 0.',
            issues[1].message
        )



if __name__ == '__main__':
    unittest.main()
