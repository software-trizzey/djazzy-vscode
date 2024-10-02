import re
from typing import Any, Dict, Optional

from djangoly.core.utils.rules import RuleCode
from .valid_verbs import VALID_VERBS
from .issue import NameIssue
from .constants import RULE_MESSAGES, VARIABLES_TO_IGNORE
from .utils import has_negative_pattern


class NameValidator:
    def __init__(self, conventions: Dict[str, Any], settings: Dict[str, Any]):
        self.conventions = conventions
        self.settings = settings

    def validate_variable_name(self, variable_name: str, variable_value: Any, lineno: int, col: int) -> Optional[NameIssue]:
        if not variable_name or variable_name.upper() in VARIABLES_TO_IGNORE:
            return None

        expressive_names = self.conventions.get("expressiveNames", {})
        if expressive_names.get("variables", {}).get("avoidShortNames", False) and len(variable_name) < 3:
            return NameIssue(
                lineno,
                col,
                RULE_MESSAGES["NAME_TOO_SHORT"].format(name=variable_name),
                rule_code=RuleCode.CDQ02
            )

        if isinstance(variable_value, bool) or re.match(r"^(true|false)$", str(variable_value), re.IGNORECASE):
            boolean_conventions = self.conventions.get("boolean", {})
            prefixes = self.settings.get("general", {}).get("prefixes", [])
            use_prefix = boolean_conventions.get("usePrefix", False)

            if use_prefix and not any(variable_name.startswith(prefix) for prefix in prefixes):
                reason = RULE_MESSAGES["BOOLEAN_NO_PREFIX"].format(name=variable_name)
                return NameIssue(lineno, col, reason, rule_code="STY01")

            if boolean_conventions.get("positiveNaming", False) and has_negative_pattern(variable_name):
                return NameIssue(
                    lineno,
                    col,
                    RULE_MESSAGES["BOOLEAN_NEGATIVE_PATTERN"].format(name=variable_name),
                    rule_code=RuleCode.STY02
                )

        return None

    def validate_function_name(self, function_name: str, function_body: Dict[str, Any], lineno: int, col: int) -> Optional[NameIssue]:
        if function_name in ["__init__", "__main__", "main"]:
            return None

        expressive_names = self.conventions.get("expressiveNames", {})
        if expressive_names.get("functions", {}).get("avoidShortNames", False) and len(function_name) <= 3:
            return NameIssue(
                lineno,
                col,
                RULE_MESSAGES["FUNCTION_TOO_SHORT"].format(name=function_name),
                rule_code=RuleCode.CDQ02
            )

        verb_found = any(function_name.startswith(verb) for verb in VALID_VERBS.keys())
        if not verb_found:
            return NameIssue(
                lineno,
                col,
                RULE_MESSAGES["FUNCTION_NAME_NO_VERB"].format(name=function_name),
                rule_code=RuleCode.CDQ03
            )

        function_length_limit = expressive_names.get("functions", {}).get("functionLengthLimit", 50)
        if function_body.get("bodyLength", 0) > function_length_limit:
            return NameIssue(
                lineno,
                col,
                RULE_MESSAGES["FUNCTION_TOO_LONG"].format(name=function_name, limit=function_length_limit),
                rule_code=RuleCode.CDQ04
            )

        return None

    def validate_object_property_name(self, object_key: str, object_value: Any, lineno: int, col: int) -> Optional[NameIssue]:
        if not object_key:
            return None

        expressive_names = self.conventions.get("expressiveNames", {})
        if expressive_names.get("objectProperties", {}).get("avoidShortNames", False) and len(object_key) <= 2:
            return NameIssue(
                lineno,
                col,
                RULE_MESSAGES["OBJECT_KEY_TOO_SHORT"].format(name=object_key),
                rule_code=RuleCode.CDQ02
            )

        if isinstance(object_value, bool) or re.match(r"^(true|false)$", str(object_value), re.IGNORECASE):
            boolean_conventions = self.conventions.get("boolean", {})
            prefixes = self.settings.get("general", {}).get("prefixes", [])
            use_prefix = boolean_conventions.get("usePrefix", False)

            if use_prefix and not any(object_key.startswith(prefix) for prefix in prefixes):
                return NameIssue(
                    lineno,
                    col,
                    RULE_MESSAGES["BOOLEAN_NO_PREFIX"].format(name=object_key),
                    rule_code=RuleCode.STY03
                )

            if boolean_conventions.get("positiveNaming", False) and has_negative_pattern(object_key):
                return NameIssue(
                    lineno,
                    col,
                    RULE_MESSAGES["BOOLEAN_NEGATIVE_PATTERN"].format(name=object_key),
                    rule_code=RuleCode.STY04
                )

        return None
