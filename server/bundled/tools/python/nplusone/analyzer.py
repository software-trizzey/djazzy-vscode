import ast


QUERY_METHODS = {"filter", "all", "get", "exclude", "iterator", "values", "values_list"}

class NPlusOneAnalyzer:
    def __init__(self, source_code: str):
        self.nplusone_issues = []
        self.source_code = source_code

    def analyze_function(self, node: ast.FunctionDef):
        """
        Analyzes a function node to detect potential N+1 issues.
        """
        loops = [n for n in ast.walk(node) if isinstance(n, (ast.For, ast.While))]
        for loop in loops:
            query_calls = [n for n in ast.walk(loop) if self.is_query_call(n)]
            if query_calls:
                for call in query_calls:
                    issue_detail = {
                        'function_name': node.name,
                        'line': call.lineno,
                        'col_offset': call.col_offset,
                        'message': f'N+1 query detected: {ast.get_source_segment(self.source_code, call)}',
                        'start_line': loop.lineno,
                        'end_line': call.lineno
                    }
                    self.nplusone_issues.append(issue_detail)

    def is_query_call(self, node: ast.AST) -> bool:
        """
        Check if a node is a Django ORM query method call.
        """
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            return node.func.attr in QUERY_METHODS
        return False

    def get_issues(self):
        return self.nplusone_issues
