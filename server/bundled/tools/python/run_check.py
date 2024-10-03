import sys
import json

from log import LOGGER
from util import serialize_file_data
from djangoly.core.parsers.django_parser import DjangoAnalyzer

def main():
    if len(sys.argv) < 2:
        LOGGER.error("Usage: python script.py <current_filepath>")
        sys.exit(1)

    current_filepath = sys.argv[1]
    input_code = sys.stdin.read()
    LOGGER.info(f"Django analyzer initialized {current_filepath}")
    analyzer = DjangoAnalyzer(
        file_path=current_filepath,
        source_code=input_code,
        conventions={}, # TODO: Pass conventions from the client
        settings={}, # TODO: Pass settings from the client
        model_cache_json=str({})
    )
    
    result = analyzer.parse_code()
    result['diagnostics'] = [diag.to_dict() for diag in result['diagnostics']]
    print(json.dumps(result, default=serialize_file_data))

if __name__ == "__main__":
    main()
