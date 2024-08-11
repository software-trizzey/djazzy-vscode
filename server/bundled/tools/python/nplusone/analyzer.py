import ast
import uuid

from constants import QUERY_METHODS, OPTIMIZATION_METHODS

class NPlusOneAnalyzer:
    def __init__(self, source_code: str):
        self.nplusone_issues = []
        self.source_code = source_code

    def analyze_function(self, node: ast.FunctionDef):
        """
        Analyzes a function node to detect potential N+1 issues, including loops, comprehensions, and generator expressions.
        """
        loops = self.find_loops(node)
        for loop in loops:
            query_calls = [n for n in ast.walk(loop) if self.is_query_call(n)]
            if query_calls:
                parent_queryset = self.find_parent_queryset(node)
                for call in query_calls:
                    if self.is_optimized(call, parent_queryset):
                        continue

                    source_segment = ast.get_source_segment(self.source_code, call)
                    related_field = self.extract_related_field(call.func)
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
                            'loop_start_line': getattr(loop, 'lineno', call.lineno),
                            'related_field': related_field,
                            'query_type': self.get_query_type(call.func),
                        },
                        'start_line': getattr(loop, 'lineno', call.lineno),
                        'end_line': call.lineno
                    }
                    self.nplusone_issues.append(issue_detail)

    def find_loops(self, node: ast.FunctionDef):
        """
        Find all loop-like constructs in the function, including for-loops, while-loops, comprehensions, and generator expressions.
        """
        loops = []
        for loop_node in ast.walk(node):
            if isinstance(loop_node, (ast.For, ast.While, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
                loops.append(loop_node)
            elif isinstance(loop_node, ast.comprehension):  # Handle comprehensions within comprehensions
                loops.append(loop_node)
        return loops
    
    def find_parent_queryset(self, node: ast.FunctionDef):
        """
        Find the parent queryset in the function node, if any.
        """
        for loop_node in ast.walk(node):
            if isinstance(loop_node, ast.Assign) and isinstance(loop_node.value, ast.Call):
                if isinstance(loop_node.value.func, ast.Attribute) and loop_node.value.func.attr in OPTIMIZATION_METHODS:
                    return loop_node.value
        return None

    def is_query_call(self, node: ast.AST) -> bool:
        """
        Check if a node is a Django ORM query method call.
        """
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            return node.func.attr in QUERY_METHODS
        return False

    def is_query_call(self, node: ast.AST) -> bool:
        """
        Check if a node is a Django ORM query method call.
        """
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            return node.func.attr in QUERY_METHODS
        return False

    def is_optimized(self, call_node: ast.Call, parent_queryset: ast.Call = None) -> bool:
        """
        Check if the queryset has been optimized with select_related or prefetch_related.
        """
        if parent_queryset:
            for parent_attr in ast.walk(parent_queryset):
                if isinstance(parent_attr, ast.Attribute) and parent_attr.attr in OPTIMIZATION_METHODS:
                    return True

        parent = call_node.func.value
        while isinstance(parent, ast.Attribute):
            if parent.attr in OPTIMIZATION_METHODS:
                return True
            parent = parent.value

        return False

    def extract_related_field(self, node: ast.Attribute) -> str:
        """
        Extracts the related field from an ast.Attribute node.
        This is used to identify the base model and the related field in a Django ORM query.
        """
        if isinstance(node, ast.Attribute):
            if isinstance(node.value, ast.Attribute):
                return self.extract_related_field(node.value)
            if isinstance(node.value, ast.Name):
                related_field = node.attr
                return related_field
        return ''

    def get_query_type(self, node: ast.Attribute) -> str:
        """
        Determines the type of query method being used in a Django ORM query.
        """
        return node.attr if node.attr in QUERY_METHODS else "unknown"

    def get_issues(self):
        return self.nplusone_issues
