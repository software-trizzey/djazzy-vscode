import re
from typing import Set

from djazzy.core.checks.base import BaseCheckService
from djazzy.core.lib.issue import IssueSeverity
from djazzy.core.lib.log import LOGGER
from djazzy.core.lib.rules import RuleCode
from djazzy.core.checks.enforce_test_name_convention.constants import TestNameConventionIssue
from djazzy.core.lib.settings import DEFAULT_TEST_NAME_PATTERN


class TestNamingCheckService(BaseCheckService):
    def __init__(self):
        super().__init__()
        self.naming_pattern = re.compile(DEFAULT_TEST_NAME_PATTERN) # TODO: Make this configurable
        self.processed_nodes = set()
        self.issues: Set[TestNameConventionIssue] = set()

    def check_function_name(self, node) -> TestNameConventionIssue:
        if not self.is_rule_enabled(RuleCode.STY03.value):
            LOGGER.debug("Skipping test naming check as the rule is disabled")
        else:
            LOGGER.debug("Running test naming check")
            if node.name.startswith("test_") and not self.naming_pattern.match(node.name):
                return self.create_naming_issue(node)

        return None

    def create_naming_issue(self, node) -> TestNameConventionIssue:
        issue = TestNameConventionIssue(
            lineno=node.lineno,
            col=node.col_offset,
            description="Test name does not follow the pattern `test_[result]_[given|if|when]_[conditions]`.",
            severity=IssueSeverity.WARNING,
            parameters={"end_col_offset": node.col_offset + len(node.name)}
        )
        return issue