import re


def is_likely_boolean(name: str) -> bool:
    likely_boolean_patterns = [
        r"^is_", r"^has_", r"^can_", r"^should_", r"^does_", r"not_", r"never_", r"no_"
    ]
    return any(re.match(pattern, name) for pattern in likely_boolean_patterns)

def has_negative_pattern(name: str) -> bool:
    negative_patterns = [
        r"^not_", r"^never_", r"^no_"
    ]
    return any(re.match(pattern, name) for pattern in negative_patterns)