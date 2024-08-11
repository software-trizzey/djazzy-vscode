import ast
import re
import uuid

from constants import QUERY_METHODS

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
                    source_segment = ast.get_source_segment(self.source_code, call)
                    related_field = self.extract_related_field(source_segment)
                    issue_detail = {
                        'id': str(uuid.uuid4()),
                        'function_name': node.name,
                        'line': call.lineno,
                        'col_offset': call.col_offset,
                        'end_col_offset': call.col_offset + len(source_segment),
                        'message': f'N+1 query detected: {source_segment}',
                        'problematic_code': source_segment,
                        'contextual_info': {
                            'is_in_loop': True,
                            'loop_start_line': loop.lineno,
                            'related_field': related_field,
                            'query_type': self.get_query_type(source_segment),
                        },
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
	    
    def extract_related_field(self, line: str) -> str:
        match = re.search(r"(\w+)\.(all\(\)|filter\(|get\()", line)
        return match.group(1) if match else ''

    def get_query_type(self, line: str) -> str:
        if ".all()" in line:
            return "all"
        if ".filter(" in line:
            return "filter"
        if ".get(" in line:
            return "get"
        return "unknown"

    def get_issues(self):
        return self.nplusone_issues
