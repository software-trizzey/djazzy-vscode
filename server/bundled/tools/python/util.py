import ast


def serialize_file_data(obj):
    if isinstance(obj, ast.AST):
        return {k: serialize_file_data(v) for k, v in ast.iter_fields(obj)}
    elif isinstance(obj, list):
        return [serialize_file_data(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: serialize_file_data(v) for k, v in obj.items()}
    else:
        return str(obj)
    

def evaluate_expr_as_string(value: ast.expr) -> str:
    """
    Helper function to evaluate an AST expression as a string.
    Safely handles exceptions and returns the lowercased string value.
    If evaluation fails, returns an empty string.
    """
    try:
        value_str = ast.literal_eval(value).strip().lower()
        return value_str
    except (ValueError, SyntaxError):
        return ''
