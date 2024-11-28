from typing import Dict, Any, List

from djangoly.core.lib.rules import RuleCode
from djangoly.core.lib.log import LOGGER


DEFAULT_NAME_LENGTH_LIMIT = 3
DEFAULT_FUNCTION_LENGTH_LIMIT = 50
DEFAULT_NOTIFICATION_INTERVAL = 45
DEFAULT_BOOLEAN_PREFIXES = ["is", "has", "should", "can", "did"]
DEFAULT_IGNORED_FUNCTIONS = ["__init__", "__main__", "main", "tearDown", "setUp", "setUpClass"]
DEFAULT_TEST_NAME_PATTERN = r"^test_[a-zA-Z0-9_]+_(given|if|when)_[a-zA-Z0-9_]+$"

ALL_RULES_SELECTED = 'ALL'

DEFAULT_LINT_SELECT = [
    # Security-related Rules (SEC)
    RuleCode.SEC01.value,
    RuleCode.SEC02.value,
    RuleCode.SEC03.value,
    RuleCode.SEC04.value,
    RuleCode.SEC05.value,
    RuleCode.SEC06.value,
    RuleCode.SEC07.value,
    RuleCode.SEC08.value,
    RuleCode.SEC09.value,
    RuleCode.SEC10.value,
    RuleCode.SEC11.value,
    RuleCode.SEC12.value,

    # Code Quality-related Rules (CDQ)
    RuleCode.CDQ01.value,
    RuleCode.CDQ02.value,
    RuleCode.CDQ03.value,
    RuleCode.CDQ04.value,
    RuleCode.CDQ05.value,
    RuleCode.CDQ06.value,

    # Style-related Rules (STY)
    RuleCode.STY01.value,
    RuleCode.STY02.value,
    RuleCode.STY03.value,
]

DEFAULT_LINT_IGNORE = []

def ensure_dict(value):
    return value if isinstance(value, dict) else {}

class DjangolySettings:
    def __init__(self, project_settings: Dict[str, Any]):
        if not project_settings:
            project_settings = {}

        self.general = self.GeneralSettings(ensure_dict(project_settings.get('general')))
        self.comments = self.CommentsSettings(ensure_dict(project_settings.get('comments')))
        self.lint = self.LintSettings(ensure_dict(project_settings.get('lint')))

    def convert_to_dict(self) -> Dict[str, Any]:
        return {
            'general': {
                'onlyCheckNewCode': self.general.only_check_new_code,
                'notificationInterval': self.general.notification_interval,
                'booleanPrefixes': self.general.boolean_prefixes,
                'nameLengthLimit': self.general.name_length_limit,
                'functionLengthLimit': self.general.function_length_limit,
                'ignoredFunctions': self.general.ignored_functions,
            },
            'comments': {
                'flagRedundant': self.comments.flag_redundant,
            },
            'lint': {
                'select': self.lint.select,
                'ignore': self.lint.ignore,
            }
        }

    class GeneralSettings:
        def __init__(self, project_settings: Dict[str, Any]):
            self.only_check_new_code = project_settings.get('onlyCheckNewCode', False)
            self.notification_interval = project_settings.get('notificationInterval', DEFAULT_NOTIFICATION_INTERVAL)
            self.name_length_limit = project_settings.get('nameLengthLimit', DEFAULT_NAME_LENGTH_LIMIT)
            self.function_length_limit = project_settings.get('functionLengthLimit', DEFAULT_FUNCTION_LENGTH_LIMIT)
            self.ignored_functions = project_settings.get('ignoredFunctions', DEFAULT_IGNORED_FUNCTIONS)
            self.boolean_prefixes = project_settings.get('boolean_prefixes', DEFAULT_BOOLEAN_PREFIXES)

    class CommentsSettings:
        def __init__(self, project_settings: Dict[str, Any]):
            self.flag_redundant = project_settings.get('flagRedundant', False)

    class LintSettings:
        def __init__(self, project_settings: Dict[str, Any]):
            selected_rules = project_settings.get('select', [])
            ignored_rules = project_settings.get('ignore', [])
            
            processed_selected_rules = self._process_rules(selected_rules)
            processed_ignored_rules = self._process_rules(ignored_rules)

            if not processed_selected_rules:
                processed_selected_rules = DEFAULT_LINT_SELECT
            elif not processed_ignored_rules:
                processed_ignored_rules = DEFAULT_LINT_IGNORE
            
            if ALL_RULES_SELECTED in processed_selected_rules:
                processed_selected_rules = []
                for rule in RuleCode:
                    processed_selected_rules.append(rule.value)

            self.select = processed_selected_rules
            self.ignore = processed_ignored_rules

        def _process_rules(self, rules: List[str]) -> List[str]:
            try:
                valid_rules = {rule.value for rule in RuleCode}
                valid_rules.add(ALL_RULES_SELECTED)
                processed_rules = []
                for rule in rules:
                    if rule.isalnum():
                        upper_rule = rule.upper()
                        if upper_rule in valid_rules:
                            processed_rules.append(upper_rule)
                return processed_rules
            except Exception as e:
                LOGGER.error(e)
                return []

_global_settings = {}

def set_settings(new_settings: Dict[str, Any]):
    global _global_settings
    _global_settings = new_settings

def get_settings() -> Dict[str, Any]:
    return _global_settings

class SettingsLoader:
    @staticmethod
    def load_from_vscode(settings_payload: Dict[str, Any]) -> DjangolySettings:
        return DjangolySettings(settings_payload)