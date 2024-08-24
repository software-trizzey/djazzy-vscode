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
		for node in ast.walk(ast.parse(self.source_code)):
			if isinstance(node, ast.Assign):
				for target in node.targets:
					if isinstance(target, ast.Name):
						self.check_assignment_security(target.id, node.value, node.lineno)
		LOGGER.info(f'Security checks complete. Found {len(self.security_issues)} issues.')

	def get_security_issues(self):
		LOGGER.debug(f'Getting {len(self.security_issues)} security issues')
		return self.security_issues
	
	def get_formatted_security_issues(self) -> List[Dict[str, Any]]:
		"""
		Get list of security issues in a formatted dictionary.
		"""
		return self._convert_security_issues_to_dict()
	
	def _convert_security_issues_to_dict(self):
		issues = []
		for issue in self.security_issues:
			issues.append({
				'issue_type': issue.issue_type,
				'line': issue.line,
				'message': issue.message,
				'severity': issue.severity,
				'doc_link': issue.doc_link
			})
		return issues

	def add_security_issue(self, issue_type: str, line: int, message: str, severity: str, doc_link: str = None):
		LOGGER.debug(f'Adding security issue: {issue_type} - {message}')
		issue = SecurityIssue(issue_type, line, message, severity, doc_link)
		self.security_issues.append(issue)

	def add_raw_sql_issue(self, node, is_using_cursor=False, severity=IssueSeverity.WARNING):
		"""
		Adds an issue if a raw() SQL query or connection.cursor() SQL execution is detected.
		"""
		LOGGER.debug(f"Raw SQL query detected for {node.func.attr} at line {node.lineno}")
		raw_query_line_number = node.lineno

		if is_using_cursor:
			message = (
				"Avoid using 'connection.cursor()' to execute raw SQL queries directly. "
				"This can bypass Django's ORM protections against SQL injection and reduce database portability. "
				"Consider using Django's ORM instead."
			)
		else:
			message = (
				"Avoid using 'raw()' SQL queries directly. This can bypass Django's ORM protections "
				"against SQL injection and reduce database portability. Consider using Django's ORM instead."
			)

		self.add_security_issue(
			issue_type="raw_sql_usage",
			line=raw_query_line_number,
			message=message,
			severity=severity,
			doc_link=IssueDocLinks.RAW_SQL_USAGE
		)

	def visit_Call(self, node):
		node_id = (node.lineno, node.col_offset)
		if node_id in self.processed_nodes:
			return

		self.processed_nodes.add(node_id)

		if isinstance(node.func, ast.Attribute):
			if node.func.attr == "raw":
				self.add_raw_sql_issue(node)

			if self.flag_cursor_detection:
				if self.is_connection_cursor(node.func):
					self.add_raw_sql_issue(node, is_using_cursor=True, severity=IssueSeverity.INFORMATION)

		self.generic_visit(node)

	def is_connection_cursor(self, func):
		if isinstance(func, ast.Attribute):
			if func.attr == "cursor":
				if isinstance(func.value, ast.Name) and func.value.id == "connection":
					return True
			return self.is_connection_cursor(func.value)
		return False

	def check_assignment_security(self, name: str, value: ast.expr, line: int):
		LOGGER.debug(f'Checking assignment security for {name}')
		value_str = ast.get_source_segment(self.source_code, value)
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
		if value.strip().lower() == 'true':
			LOGGER.debug('DEBUG is set to True')
			self.add_security_issue(
				'debug_true',
				line,
				f'DEBUG is set to True. Ensure it is False in production.\n\n{IssueDocLinks.DEBUG}\n',
				IssueSeverity.WARNING,
				IssueDocLinks.DEBUG
			)

	def check_secret_key(self, value: str, line: int):
		env_var_patterns = re.compile(
			r'os\.environ\.get\(|env\(|config\(|os\.getenv\('
		)

		if not env_var_patterns.search(value.strip()):
			self.add_security_issue(
				'hardcoded_secret_key',
				line,
				f'SECRET_KEY appears to be hardcoded. It is strongly recommended to store it in an environment variable for better security.\n\n{IssueDocLinks.SECRET_KEY}\n',
				IssueSeverity.WARNING,
				IssueDocLinks.SECRET_KEY
			)

	def check_allowed_hosts(self, value: str, line: int):
		if value == '[]':
			LOGGER.debug('ALLOWED_HOSTS is empty')
			self.add_security_issue(
				'empty_allowed_hosts',
				line,
				f'ALLOWED_HOSTS is empty. This is not secure for production.\n\n{IssueDocLinks.ALLOWED_HOSTS}\n',
				IssueSeverity.WARNING,
				IssueDocLinks.ALLOWED_HOSTS
			)
		elif "'*'" in value or '"*"' in value:
			LOGGER.debug('Wildcard "*" found in ALLOWED_HOST')
			self.add_security_issue(
				'wildcard_allowed_hosts',
				line,
				f'ALLOWED_HOSTS contains a wildcard "*". This is not recommended for production.\n\n{IssueDocLinks.ALLOWED_HOSTS}\n',
				IssueSeverity.WARNING,
				IssueDocLinks.ALLOWED_HOSTS
			)

	def check_csrf_cookie(self, value: str, line: int):
		if value == 'False':
			LOGGER.debug('CSRF_COOKIE_SECURE is set to False')
			self.add_security_issue(
				'csrf_cookie_secure_false',
				line,
				f'CSRF_COOKIE_SECURE is False. Set this to True to avoid transmitting the CSRF cookie over HTTP accidentally.\n\n{IssueDocLinks.CSRF_COOKIE_SECURE}\n',
				IssueSeverity.WARNING,
				IssueDocLinks.CSRF_COOKIE_SECURE
			)

	def check_session_cookie(self, value: str, line: int):
		if value == 'False':
			LOGGER.debug('SESSION_COOKIE_SECURE is set to False')
			self.add_security_issue(
				'session_cookie_secure_false',
				line,
				f'SESSION_COOKIE_SECURE is False. Set this to True to avoid transmitting the session cookie over HTTP accidentally.\n\n{IssueDocLinks.SESSION_COOKIE_SECURE}\n',
				IssueSeverity.WARNING,
				IssueDocLinks.SESSION_COOKIE_SECURE
			)