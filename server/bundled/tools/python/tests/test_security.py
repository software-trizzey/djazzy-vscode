import unittest
from unittest.mock import patch
from constants import IssueSeverity
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


if __name__ == '__main__':
    unittest.main()
