import os
import json

from ..utils.log import LOGGER
from ..analyzers.model_checker import run_analysis


def analyze_file(file_path: str):
    """
    Analyze a single Python file. Returns an error if the file isn't a Python file.
    """
    LOGGER.debug(f"Analyzing: {file_path}")

    if not file_path.endswith('.py'):
        return {"error": f"File {file_path} is not a Python file."}

    try:
        with open(file_path, 'r') as f:
            input_code = f.read()
    except FileNotFoundError:
        return {"error": f"File {file_path} not found."}

    result = run_analysis(file_path, input_code)
    diagnostics_output = [diagnostic.to_dict() for diagnostic in result['diagnostics']]
    
    return {"diagnostics": diagnostics_output, "diagnostics_count": result['diagnostics_count']}


def analyze_directory(directory):
    """
    Recursively analyze all `.py` files in the provided directory.
    """
    results = {}
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(".py"):
                file_path = os.path.join(root, file)
                file_result = analyze_file(file_path)
                results[file_path] = file_result
    return results


def check_command(args):
    """
    Handler for the 'check' subcommand.
    """
    file_path = args.file

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    elif not os.path.isfile(file_path):
        raise FileNotFoundError(f"Provided path is not a file: {file_path}")

    results = {file_path: analyze_file(file_path)}

    print(json.dumps(results, default=str, indent=2))
    print(f"\nFound {results[file_path]['diagnostics_count']} issues.")
