import re
from typing import Any, Dict, Optional

from djazzy.core.checks.base import BaseCheckService
from djazzy.core.lib.rules import RuleCode
from .valid_verbs import VALID_VERBS
from .issue import NameIssue
from .constants import RULE_MESSAGES, VARIABLES_TO_IGNORE
from .utils import has_negative_pattern


class NameValidator(BaseCheckService):
    """
    TODO: Skip verb check for class method names with "@classmethod" or "@property" decorators
    """

    def __init__(self):
        super().__init__()

    def validate_variable_name(
        self, variable_name: str,
        variable_value: Any,
        lineno: int,
        col: int
    ) -> Optional[NameIssue]:
        """
        TODO: Skip name check for certain class method variables like "abstract"
        """
        if (
            not variable_name
            or not isinstance(variable_name, str)
            or variable_name == "_"
            or variable_name.upper() in VARIABLES_TO_IGNORE
        ):
            return None
        
        variable_name = variable_name.lstrip("_")

        if self.is_rule_enabled(RuleCode.CDQ02.value):
            if len(variable_name) < self.get_name_length_limit():
                return NameIssue(
                    lineno,
                    col,
                    RULE_MESSAGES["NAME_TOO_SHORT"].format(name=variable_name),
                    rule_code=RuleCode.CDQ02.value
                )
        if isinstance(variable_value, bool) or re.match(r"^(true|false)$", str(variable_value), re.IGNORECASE):
            if self.is_rule_enabled(RuleCode.STY01.value):
                prefixes =  self.get_boolean_prefixes()

                if not any(variable_name.startswith(prefix) for prefix in prefixes):
                    reason = RULE_MESSAGES["BOOLEAN_NO_PREFIX"].format(name=variable_name)
                    return NameIssue(lineno, col, reason, rule_code=RuleCode.STY01.value)

            if self.is_rule_enabled(RuleCode.STY02.value):
                if has_negative_pattern(variable_name):
                    return NameIssue(
                        lineno,
                        col,
                        RULE_MESSAGES["BOOLEAN_NEGATIVE_PATTERN"].format(name=variable_name),
                        rule_code=RuleCode.STY02.value
                )

        return None

    def validate_function_name(
        self,
        function_name: str,
        function_body: Dict[str, Any],
        lineno: int, col: int
    ) -> Optional[NameIssue]:
        if function_name in self.get_ignored_functions() or not isinstance(function_name, str):
            return None
        
        function_name = function_name.lstrip("_")

        if self.is_rule_enabled(RuleCode.CDQ02.value):
            if len(function_name) <= self.get_name_length_limit():
                return NameIssue(
                    lineno,
                    col,
                    RULE_MESSAGES["FUNCTION_TOO_SHORT"].format(name=function_name),
                    rule_code=RuleCode.CDQ02.value
                )
        if self.is_rule_enabled(RuleCode.CDQ03.value):
            verb_found = any(function_name.startswith(verb) for verb in VALID_VERBS.keys())
            if not verb_found:
                return NameIssue(
                    lineno,
                    col,
                    RULE_MESSAGES["FUNCTION_NAME_NO_VERB"].format(name=function_name),
                    rule_code=RuleCode.CDQ03.value
                )
        if self.is_rule_enabled(RuleCode.CDQ04):
            function_length_limit = self.get_function_length_limit()
            if function_body.get("bodyLength", 0) > function_length_limit:
                return NameIssue(
                    lineno,
                    col,
                    RULE_MESSAGES["FUNCTION_TOO_LONG"].format(name=function_name, limit=function_length_limit),
                    rule_code=RuleCode.CDQ04.value
                )

        return None

    def validate_object_property_name(
        self,
        object_key: str,
        object_value: Any,
        lineno: int,
        col: int
    ) -> Optional[NameIssue]:
        if not object_key or not isinstance(object_key, str):
            return None

        if self.is_rule_enabled(RuleCode.CDQ02.value):
            if len(object_key) <= self.get_name_length_limit():
                return NameIssue(
                    lineno,
                    col,
                    RULE_MESSAGES["NAME_TOO_SHORT"].format(name=object_key),
                    rule_code=RuleCode.CDQ02.value
                )

        if isinstance(object_value, bool) or re.match(r"^(true|false)$", str(object_value), re.IGNORECASE):
            if self.is_rule_enabled(RuleCode.STY01.value):
                prefixes = self.get_boolean_prefixes()
                if not any(object_key.startswith(prefix) for prefix in prefixes):
                    return NameIssue(
                        lineno,
                        col,
                        RULE_MESSAGES["BOOLEAN_NO_PREFIX"].format(name=object_key),
                        rule_code=RuleCode.STY01.value
                )

            if self.is_rule_enabled(RuleCode.STY02.value):
                if has_negative_pattern(object_key):
                    return NameIssue(
                        lineno,
                        col,
                        RULE_MESSAGES["BOOLEAN_NEGATIVE_PATTERN"].format(name=object_key),
                        rule_code=RuleCode.STY02.value
                    )

        return None
