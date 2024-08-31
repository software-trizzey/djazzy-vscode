import ast
import json
import sys
from typing import List, Optional, Dict

from util import serialize_file_data
from log import LOGGER

from ast_parser import Analyzer


def get_relevant_imports(tree: ast.Module, function_name: str) -> List[str]:
    relevant_imports = []
    for node in ast.walk(tree):
        # Check if it's an Import or ImportFrom node
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            relevant_imports.append(ast.unparse(node))
        # Check if the import is used within the function's AST
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id == function_name:
                for ancestor in ast.walk(tree):
                    if isinstance(ancestor, (ast.Import, ast.ImportFrom)) and ast.unparse(ancestor) not in relevant_imports:
                        relevant_imports.append(ast.unparse(ancestor))
    return relevant_imports


def find_function_calls(tree: ast.Module, function_name: str) -> List[Dict[str, int]]:
    """
    TODO: Extend this to find calls throughout the entire codebase?
    """

    call_sites = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == function_name:
            call_sites.append({
                "line": node.lineno,
                "col": node.col_offset,
            })
    return call_sites


def get_function_details(source_code: str, function_name: str, line_number: int) -> Optional[Dict[str, any]]:
    try:
        tree = ast.parse(source_code)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == function_name and node.lineno - 1 == line_number:
                body_with_lines, raw_body = Analyzer(source_code).get_function_body(node)
                relevant_imports = get_relevant_imports(tree, function_name)
                function_calls = find_function_calls(tree, function_name)

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
                        "imports": relevant_imports,
                        "call_sites": function_calls
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
