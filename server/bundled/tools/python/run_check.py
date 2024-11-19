import sys
import json

from log import LOGGER
from djangoly.core.parsers.django_parser import DjangoAnalyzer
from djangoly.core.lib.settings import ensure_dict

def main():
    if len(sys.argv) < 3:
        LOGGER.error("Usage: python script.py <current_filepath>, <extension_settings>")
        sys.exit(1)

    current_filepath = sys.argv[1]
    extension_settings_json = sys.argv[2]
    extension_settings = json.loads(extension_settings_json)
    input_code = sys.stdin.read()

    analyzer = DjangoAnalyzer(
        file_path=current_filepath,
        source_code=input_code,
        settings=ensure_dict(extension_settings),
        model_cache_json=str({})
    )
    
    LOGGER.info(f"Django analyzer initialized {current_filepath}")
    LOGGER.debug(f"Analyzer running with settings: {analyzer.get_settings()}")
    
    result = analyzer.parse_code()
    diagnostics_output = [diagnostic.to_dict() for diagnostic in result['diagnostics']]
    diagnostics_to_return = {"diagnostics": diagnostics_output, "diagnostics_count": result['diagnostics_count']}

    print(json.dumps(diagnostics_to_return))

if __name__ == "__main__":
    main()
