import ast
import re

from typing import Any, Dict, List

from log import LOGGER
from constants import (
    ALLOWED_HOSTS,
    CSRF_COOKIE_SECURE,
    DEBUG,
    SECRET_KEY,
    SESSION_COOKIE,
    IssueDocLinks,
    IssueSeverity
)

class SecurityIssue(object):
    def __init__(self, issue_type: str, line: int, message: str, severity: str, doc_link: str = None):
        self.issue_type = issue_type
        self.line = line
        self.message = message
        self.severity = severity
        self.doc_link = doc_link

    def __str__(self):
        return f'{self.issue_type} - {self.message}'

    def __repr__(self):
        return str(self)


class SecurityCheckService(ast.NodeVisitor):
    def __init__(self, source_code: str, flag_cursor_detection=True):
        self.source_code = source_code
        self.processed_nodes = set()
        self.security_issues = []
        self.flag_cursor_detection = flag_cursor_detection

    def run_security_checks(self):
        LOGGER.info('Running security checks...')
        tree = ast.parse(self.source_code)
        self.visit(tree)  # This will automatically invoke the appropriate visit_* methods
        LOGGER.info(f'Security checks complete. Found {len(self.security_issues)} issues.')

    def get_security_issues(self):
        LOGGER.debug(f'Getting {len(self.security_issues)} security issues')
        return self.security_issues

    def get_formatted_security_issues(self) -> List[Dict[str, Any]]:
        return self._convert_security_issues_to_dict()

    def _convert_security_issues_to_dict(self):
        return [
            {
                'issue_type': issue.issue_type,
                'line': issue.line,
                'message': issue.message,
                'severity': issue.severity,
                'doc_link': issue.doc_link
            }
            for issue in self.security_issues
        ]

    def add_security_issue(self, issue_type: str, line: int, message: str, severity: str, doc_link: str = None):
        LOGGER.debug(f'Adding security issue: {issue_type} - {message}')
        issue = SecurityIssue(issue_type, line, message, severity, doc_link)
        self.security_issues.append(issue)

    def add_raw_sql_issue(self, node, is_using_cursor=False, severity=IssueSeverity.WARNING):
        raw_query_line_number = node.lineno
        message = (
            "Avoid using 'connection.cursor()' to execute raw SQL queries directly. "
            if is_using_cursor else
            "Avoid using 'raw()' SQL queries directly. "
        )
        message += (
            "This can bypass Django's ORM protections against SQL injection and reduce database portability. "
            "Consider using Django's ORM instead."
        )
        self.add_security_issue(
            issue_type="raw_sql_usage",
            line=raw_query_line_number,
            message=message,
            severity=severity,
            doc_link=IssueDocLinks.RAW_SQL_USAGE
        )

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
                self.add_raw_sql_issue(node, is_using_cursor=True, severity=IssueSeverity.INFORMATION)

        self.generic_visit(node)

    def visit_Assign(self, node):
        LOGGER.debug(f'[SECURITY CHECK] Visiting Assign node at line {node.lineno}')
        for target in node.targets:
            if isinstance(target, ast.Name):
                # Call check_assignment_security directly when visiting an assignment node
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

    def check_debug_setting(self, value: str, line: int):
        if value.lower() == 'true':
            self.add_security_issue(
                'debug_true',
                line,
                f'DEBUG is set to True. Ensure it is False in production.\n\n{IssueDocLinks.DEBUG}\n',
                IssueSeverity.WARNING,
                IssueDocLinks.DEBUG
            )

    def check_secret_key(self, value: str, line: int):
        env_var_patterns = re.compile(r'os\.environ\.get\(|env\(|config\(|os\.getenv\(')
        if not env_var_patterns.search(value):
            self.add_security_issue(
                'hardcoded_secret_key',
                line,
                f'SECRET_KEY appears to be hardcoded. It is strongly recommended to store it in an environment variable for better security.\n\n{IssueDocLinks.SECRET_KEY}\n',
                IssueSeverity.WARNING,
                IssueDocLinks.SECRET_KEY
            )

    def check_allowed_hosts(self, value: str, line: int):
        if value == '[]':
            self.add_security_issue(
                'empty_allowed_hosts',
                line,
                f'ALLOWED_HOSTS is empty. This is not secure for production.\n\n{IssueDocLinks.ALLOWED_HOSTS}\n',
                IssueSeverity.WARNING,
                IssueDocLinks.ALLOWED_HOSTS
            )
        elif "'*'" in value or '"*"' in value:
            self.add_security_issue(
                'wildcard_allowed_hosts',
                line,
                f'ALLOWED_HOSTS contains a wildcard "*". This is not recommended for production.\n\n{IssueDocLinks.ALLOWED_HOSTS}\n',
                IssueSeverity.WARNING,
                IssueDocLinks.ALLOWED_HOSTS
            )

    def check_csrf_cookie(self, value: str, line: int):
        if value == 'False':
            self.add_security_issue(
                'csrf_cookie_secure_false',
                line,
                f'CSRF_COOKIE_SECURE is False. Set this to True to avoid transmitting the CSRF cookie over HTTP accidentally.\n\n{IssueDocLinks.CSRF_COOKIE_SECURE}\n',
                IssueSeverity.WARNING,
                IssueDocLinks.CSRF_COOKIE_SECURE
            )

    def check_session_cookie(self, value: str, line: int):
        if value == 'False':
            self.add_security_issue(
                'session_cookie_secure_false',
                line,
                f'SESSION_COOKIE_SECURE is False. Set this to True to avoid transmitting the session cookie over HTTP accidentally.\n\n{IssueDocLinks.SESSION_COOKIE_SECURE}\n',
                IssueSeverity.WARNING,
                IssueDocLinks.SESSION_COOKIE_SECURE
            )
