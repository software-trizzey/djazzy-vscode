import ast


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