import ast

from djazzy.core.lib.settings import get_settings
from djazzy.core.lib.settings import set_settings
from djazzy.core.lib.settings import DEFAULT_NAME_LENGTH_LIMIT
from djazzy.core.lib.settings import DEFAULT_BOOLEAN_PREFIXES
from djazzy.core.lib.settings import DEFAULT_IGNORED_FUNCTIONS
from djazzy.core.lib.settings import DEFAULT_FUNCTION_LENGTH_LIMIT

class BaseCheckService(ast.NodeVisitor):
    def __init__(self, updated_settings=None):
        super().__init__()
        if updated_settings:
            set_settings(updated_settings)
        self.settings = get_settings()
        self.selected_rules = self.settings.get('lint', {}).get('select', [])
        self.ignored_rules = self.settings.get('lint', {}).get('ignore', [])

    def is_rule_enabled(self, rule_code: str) -> bool:
        return rule_code in self.selected_rules and rule_code not in self.ignored_rules
    
    def get_name_length_limit(self) -> int:
        return self.settings.get('general', {}).get('nameLengthLimit', DEFAULT_NAME_LENGTH_LIMIT)

    def get_boolean_prefixes(self) -> list:
        return self.settings.get('general', {}).get('booleanPrefixes', DEFAULT_BOOLEAN_PREFIXES)
    
    def get_ignored_functions(self) -> list:
        return self.settings.get('general', {}).get('ignoredFunctions', DEFAULT_IGNORED_FUNCTIONS)
    
    def get_function_length_limit(self) -> int:
        return self.settings.get('general', {}).get('functionLengthLimit', DEFAULT_FUNCTION_LENGTH_LIMIT)