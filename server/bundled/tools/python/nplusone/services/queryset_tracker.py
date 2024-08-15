from typing import Dict, Set

from log import LOGGER

class QuerysetTracker:
    def __init__(self):
        self.optimized_querysets: Dict[str, Set[str]] = {}

    def add_optimized_field(self, base_model: str, field_path: str):
        parts = field_path.split('__')
        current_model = base_model.capitalize()
        for i, part in enumerate(parts):
            if current_model not in self.optimized_querysets:
                self.optimized_querysets[current_model] = set()
            
            self.optimized_querysets[current_model].add(part.lower())
            
            if i < len(parts) - 1:
                self.optimized_querysets[current_model].add('__'.join(parts[i:]).lower())
            
            if i < len(parts) - 1:
                current_model = part.capitalize()

    def is_optimized(self, base_model: str, field: str) -> bool:
        base_model = base_model.capitalize()
        field = field.lower()

        if base_model in self.optimized_querysets:
            if field in self.optimized_querysets[base_model]:
                return True
            
            for optimized_field in self.optimized_querysets[base_model]:
                if optimized_field.startswith(f"{field}__"):
                    return True

        for model, fields in self.optimized_querysets.items():
            if base_model.lower() in fields:
                return True

        return False