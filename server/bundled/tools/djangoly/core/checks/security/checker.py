import ast
import re

from typing import Any, Dict, List

from djangoly.core.utils.log import LOGGER
from djangoly.core.utils.constants import (
    ALLOWED_HOSTS,
    CSRF_COOKIE_SECURE,
    DEBUG,
    MIDDLEWARE_LIST,
    SECRET_KEY,
    SESSION_COOKIE,
    SECURE_SSL_REDIRECT,
    X_FRAME_OPTIONS,
    SECURE_HSTS_SECONDS,
    SECURE_HSTS_INCLUDE_SUBDOMAINS,
)
from djangoly.core.utils.evaluate_str import evaluate_expr_as_string

from djangoly.core.utils.issue import IssueSeverity

from .security_issue import SecurityIssue
from .security_rules import SecurityRules


class SecurityCheckService(ast.NodeVisitor):
    def __init__(self, source_code: str, flag_cursor_detection=True):
        self.source_code = source_code
        self.processed_nodes = set()
        self.security_issues = []
        self.flag_cursor_detection = flag_cursor_detection

    def run_security_checks(self):
        LOGGER.debug('Running security checks...')
        tree = ast.parse(self.source_code)
        self.visit(tree)
        LOGGER.debug(f'Security checks complete. Found {len(self.security_issues)} issues.')

    def get_security_issues(self):
        LOGGER.debug(f'Getting {len(self.security_issues)} security issues')
        return self.security_issues

    def get_formatted_security_issues(self) -> List[Dict[str, Any]]:
        return self._convert_security_issues_to_dict()

    def issue_already_exists(self, issue_type: str) -> bool:
        return any(issue.code == issue_type for issue in self.security_issues)

    def get_setting_value(self, setting_name: str):
        try:
            tree = ast.parse(self.source_code)
            for node in ast.walk(tree):
                if isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name) and target.id == setting_name:
                            value = ast.literal_eval(node.value)
                            line = node.lineno
                            return value, line
        except Exception as e:
            LOGGER.error(f"Error parsing setting {setting_name}: {e}")
        return None, None

    def _convert_security_issues_to_dict(self):
        return [
            {
                'issue_type': issue.code,
                'line': issue.lineno,
                'message': issue.message,
                'severity': issue.severity,
                'doc_link': issue.doc_link
            }
            for issue in self.security_issues
        ]

    def add_security_issue(self, rule: SecurityRules, line: int, severity: IssueSeverity = IssueSeverity.WARNING):
        LOGGER.debug(f'Adding security issue: {rule.code} - {rule.description}')
        issue = SecurityIssue(rule.code, line, rule.description, severity, rule.doc_link)
        self.security_issues.append(issue)

    def add_raw_sql_issue(self, node, is_using_cursor=False):
        rule = SecurityRules.RAW_SQL_USAGE_WITH_CURSOR if is_using_cursor else SecurityRules.RAW_SQL_USAGE
        self.add_security_issue(rule, node.lineno, IssueSeverity.INFORMATION)

    def visit_Call(self, node):
        LOGGER.debug(f'[SECURITY CHECK] Visiting Call node at line {node.lineno}')
        node_id = (node.lineno, node.col_offset)
        if node_id in self.processed_nodes:
            return

        self.processed_nodes.add(node_id)

        if isinstance(node.func, ast.Attribute):
            if node.func.attr == "raw":
                self.add_raw_sql_issue(node)

            if self.flag_cursor_detection and self.is_connection_cursor(node.func):
                self.add_raw_sql_issue(node, is_using_cursor=True)
            
            # get issues
            self.get_security_issues()
            # clear issues
            self.security_issues = []
            return 

        self.generic_visit(node)

    def visit_Assign(self, node):
        LOGGER.debug(f'[SECURITY CHECK] Visiting Assign node at line {node.lineno}')
        for target in node.targets:
            if isinstance(target, ast.Name):
                self.check_assignment_security(target.id, node.value, node.lineno)
        self.generic_visit(node)

    def is_connection_cursor(self, func):
        return (
            isinstance(func, ast.Attribute) and
            func.attr == "cursor" and
            isinstance(func.value, ast.Name) and
            func.value.id == "connection"
        )

    def check_assignment_security(self, name: str, value: ast.expr, line: int):
        value_str = ast.get_source_segment(self.source_code, value).strip()
        if name == DEBUG:
            self.check_debug_setting(value_str, line)
        elif name == SECRET_KEY:
            self.check_secret_key(value_str, line)
        elif name == ALLOWED_HOSTS:
            self.check_allowed_hosts(value_str, line)
        elif name == CSRF_COOKIE_SECURE:
            self.check_csrf_cookie(value_str, line)
        elif name == SESSION_COOKIE:
            self.check_session_cookie(value_str, line)
        elif name == SECURE_SSL_REDIRECT:
            self.check_ssl_redirect(value_str, line)
        elif name == X_FRAME_OPTIONS:
            self.check_x_frame_options(value_str, line)

        if name == SECURE_HSTS_SECONDS or name == SECURE_HSTS_INCLUDE_SUBDOMAINS:
            hsts_seconds_value, hsts_seconds_line = self.get_setting_value(SECURE_HSTS_SECONDS)
            hsts_subdomains_value, hsts_subdomains_line = self.get_setting_value(SECURE_HSTS_INCLUDE_SUBDOMAINS)
            self.check_hsts_settings(hsts_seconds_value, hsts_seconds_line, hsts_subdomains_value, hsts_subdomains_line)

        detected_issues = self.get_security_issues()
        self.security_issues = []
        return detected_issues

    def check_debug_setting(self, value: str, line: int):
        if value.lower() == 'true':
            self.add_security_issue(SecurityRules.DEBUG_TRUE, line)

    def check_secret_key(self, value: str, line: int):
        env_var_patterns = re.compile(
            r'os\.environ(\[|\.)|os\.getenv\(|config\(|env\(|dotenv\.get_key\(|env\.str\(|django_environ\.Env\('
        )

        if not env_var_patterns.search(value):
            self.add_security_issue(SecurityRules.HARDCODED_SECRET_KEY, line)

    def check_allowed_hosts(self, value: str, line: int):
        if value == '[]':
            self.add_security_issue(SecurityRules.EMPTY_ALLOWED_HOSTS, line)
        elif "'*'" in value or '"*"' in value:
            self.add_security_issue(SecurityRules.WILDCARD_ALLOWED_HOSTS, line)

    def check_csrf_cookie(self, value: str, line: int):
        if value == 'False':
            self.add_security_issue(SecurityRules.CSRF_COOKIE_SECURE_FALSE, line)

    def check_session_cookie(self, value: str, line: int):
        if value == 'False':
            self.add_security_issue(SecurityRules.SESSION_COOKIE_SECURE_FALSE, line)

    def check_ssl_redirect(self, value: str, line: int):
        if value.lower() == 'false':
            self.add_security_issue(SecurityRules.SECURE_SSL_REDIRECT_FALSE, line)

    def check_x_frame_options(self, value: ast.expr, line: int):
        value_str = evaluate_expr_as_string(value)
        
        if not value_str or value_str not in ['deny', 'sameorigin']:
            self.add_security_issue(SecurityRules.X_FRAME_OPTIONS_NOT_SET, line)

        middleware_value, _ = self.get_setting_value(MIDDLEWARE_LIST)
        if middleware_value and "django.middleware.clickjacking.XFrameOptionsMiddleware" not in middleware_value:
            self.add_security_issue(SecurityRules.X_FRAME_OPTIONS_MISSING_MIDDLEWARE, line)

    def check_hsts_settings(self, hsts_seconds_value: Any, hsts_seconds_line: int, hsts_subdomains_value: Any, hsts_subdomains_line: int):
        if hsts_seconds_value == 0 and not self.issue_already_exists(SecurityRules.SECURE_HSTS_SECONDS_NOT_SET.code):
            self.add_security_issue(SecurityRules.SECURE_HSTS_SECONDS_NOT_SET, hsts_seconds_line)
            
        if hsts_seconds_value == 0 and hsts_subdomains_value is True and not self.issue_already_exists(SecurityRules.SECURE_HSTS_INCLUDE_SUBDOMAINS_IGNORED.code):
            self.add_security_issue(SecurityRules.SECURE_HSTS_INCLUDE_SUBDOMAINS_IGNORED, hsts_subdomains_line)
        
        if hsts_seconds_value != 0 and hsts_subdomains_value is False and not self.issue_already_exists(SecurityRules.SECURE_HSTS_INCLUDE_SUBDOMAINS_FALSE.code):
            self.add_security_issue(SecurityRules.SECURE_HSTS_INCLUDE_SUBDOMAINS_FALSE, hsts_subdomains_line)

    def check_raw_sql(self, node: ast.Call):
        if isinstance(node, ast.Call):
            node_id = (node.lineno, node.col_offset)
            if node_id in self.processed_nodes:
                return

            self.processed_nodes.add(node_id)

            if isinstance(node.func, ast.Attribute):
                if node.func.attr == "raw":
                    self.add_raw_sql_issue(node)

                if self.flag_cursor_detection and self.is_connection_cursor(node.func):
                    self.add_raw_sql_issue(node, is_using_cursor=True)
                
                detected_issues = self.get_security_issues()
                self.security_issues = []
                return detected_issues
