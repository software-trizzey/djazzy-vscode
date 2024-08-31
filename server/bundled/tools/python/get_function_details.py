import ast
import json
import sys

from util import serialize_file_data
from log import LOGGER

from ast_parser import Analyzer


def get_function_details(source_code: str, function_name: str, line_number: int):
    try:
        tree = ast.parse(source_code)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == function_name and node.lineno - 1 == line_number:
                body_with_lines, raw_body = Analyzer(source_code).get_function_body(node)
                return {
                    "name": node.name,
                    "args": [arg.arg for arg in node.args.args],
                    "returns": ast.dump(node.returns) if node.returns else None,
                    "body": body_with_lines,
                    "raw_body": raw_body,
                    "decorators": [ast.dump(decorator) for decorator in node.decorator_list],
                    "context": {
                        "start": node.lineno,
                        "end": node.end_lineno,
                        "start_col": node.col_offset,
                        "end_col": node.end_col_offset,
                    }
                }

    except SyntaxError as e:
        LOGGER.warning(f"Syntax error in {source_code}: {e}")
        return None
    except Exception as e:
        LOGGER.warning(f"Error in {source_code}: {e}")
        return None
    
    return None


def main():
    if len(sys.argv) < 3:
        LOGGER.error("Usage: python script.py <function_name_str> <line_number_str>")
        sys.exit(1)

    function_name = sys.argv[1]
    try:
        line_number = int(sys.argv[2])
    except ValueError:
        LOGGER.error("Line number must be an integer.")
        sys.exit(1)

    input_code = sys.stdin.read()
    parsed_code = get_function_details(input_code, function_name, line_number)
    
    if parsed_code:
        print(json.dumps(parsed_code, default=serialize_file_data))
    else:
        LOGGER.warning(f"Function '{function_name}' not found at line {line_number}.")
        sys.exit(1)

if __name__ == "__main__":
    main()
