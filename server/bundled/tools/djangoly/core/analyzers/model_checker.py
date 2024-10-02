import json

from typing import Dict, Any

from ..parsers.django_parser import DjangoAnalyzer


def run_analysis(file_path: str, input_code: str) -> Dict[str, Any]:
    """
    Programmatically analyze the provided source code.
    
    TODO: Probably move this elsewhere in the future.
    """
    model_cache = {} # temporary cache for models
    conventions = {} # temporary conventions
    settings = {} # temporary settings
    json_model_cache = json.dumps(model_cache)
    analyzer = DjangoAnalyzer(file_path, input_code, conventions, settings, json_model_cache,)
    return analyzer.parse_code()