import ast
import uuid
from typing import List

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
            query_calls = self.find_query_calls(loop)
            if query_calls:
                parent_queryset = self.find_parent_queryset(node)
                unique_queries = self.deduplicate_queries(query_calls, loop)
                for call in unique_queries:
                    if self.is_optimized(call, parent_queryset):
                        continue
                    
                    self.add_issue(node, loop, call)

    def deduplicate_queries(self, query_calls: List[ast.AST], loop_node: ast.AST) -> List[ast.AST]:
        """
        Deduplicate query calls based on their structure and location to avoid redundant diagnostics.
        """
        unique_calls = {}
        for call in query_calls:
            # Extract the base function or attribute (e.g., "filter", "get", "select_related")
            base_query = ''
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute):
                base_query = call.func.attr
            elif isinstance(call, ast.Attribute):
                base_query = call.attr
            
            loop_start_line = getattr(loop_node, 'lineno', 0)
            call_line = getattr(call, 'lineno', 0)
            key = f"{base_query}-{loop_start_line}-{call_line}"
            
            if key not in unique_calls:
                unique_calls[key] = call
        
        return list(unique_calls.values())

    def add_issue(self, func_node: ast.FunctionDef, loop_node: ast.AST, call_node: ast.AST):
        """
        Add a new N+1 query issue to the list of issues, with enhanced contextual information.
        """
        source_segment = ast.get_source_segment(self.source_code, call_node)
        related_field = self.extract_related_field(call_node)
        is_related_field_access = self.is_related_field_access(call_node) if isinstance(call_node, ast.Attribute) else False
        query_type = self.get_query_type(call_node)
        issue_message = self.create_issue_message(source_segment, query_type, related_field, is_related_field_access)

        issue_detail = {
            'id': str(uuid.uuid4()),
            'function_name': func_node.name,
            'line': call_node.lineno,
            'col_offset': call_node.col_offset,
            'end_col_offset': call_node.col_offset + len(source_segment),
            'message': issue_message,
            'problematic_code': source_segment,
            'contextual_info': {
                'is_in_loop': True,
                'loop_start_line': getattr(loop_node, 'lineno', call_node.lineno),
                'related_field': related_field,
                'query_type': query_type,
                'is_related_field_access': is_related_field_access,  # New field for debugging
            },
            'start_line': getattr(loop_node, 'lineno', call_node.lineno),
            'end_line': call_node.lineno
        }
        self.nplusone_issues.append(issue_detail)
    
    def create_issue_message(
        self,
        source_segment: str,
        query_type: str,
        related_field: str,
        is_related_field_access: bool
    ) -> str:
        """
        Creates a streamlined message for the detected N+1 query issue.
        """
        if is_related_field_access:
            query_explanation = (
                f"Accessing the related field '{related_field}' in a loop can cause multiple database queries (N+1 issue). "
                "Consider using `select_related` or `prefetch_related` to optimize."
            )
        else:
            query_explanation = (
                f"Using the '{query_type}' method in a loop can cause multiple database queries (N+1 issue). "
                "Consider using `select_related` or `prefetch_related` to optimize."
            )

        return f"N+1 Query Detected: {source_segment}\n\n{query_explanation}"

    def extract_related_field(self, node: ast.AST) -> str:
        """
        Extracts the related field from an ast.Attribute or ast.Call node.
        Handles common Django ORM patterns and nested attributes more accurately.
        """
        if isinstance(node, ast.Call):
            node = node.func

        if isinstance(node, ast.Attribute):
            attrs = []
            current = node
            while isinstance(current, ast.Attribute):
                if current.attr not in ('objects', 'all', 'filter', 'exclude', 'select_related', 'prefetch_related', 'get'):
                    attrs.append(current.attr)
                current = current.value

            attrs.reverse()

            if attrs:
                return '.'.join(attrs)

        return ''
    
    def get_query_type(self, node: ast.AST) -> str:
        """
        Determines the type of query being used in a Django ORM query.
        """
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            return node.func.attr if node.func.attr in QUERY_METHODS else "unknown"
        elif isinstance(node, ast.Attribute):
            return "attribute_access"
        return "unknown"

    def find_loops(self, node: ast.FunctionDef):
        """
        Find all loop-like constructs in the function, including for-loops, while-loops, comprehensions, and generator expressions.
        """
        loops = []
        for loop_node in ast.walk(node):
            if isinstance(loop_node, (ast.For, ast.While)):
                loops.append(loop_node)
            elif isinstance(loop_node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
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
    
    def find_query_calls(self, node: ast.AST):
        """
        Find all potential query calls within a given AST node.
        """
        return [ast_node for ast_node in ast.walk(node) if self.is_query_call(ast_node)]

    def is_query_call(self, node: ast.AST) -> bool:
        """
        Detects if a node represents a potential Django ORM query or a related field access.
        """
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                return node.func.attr in QUERY_METHODS or self.is_multi_level_attribute(node.func)
            elif isinstance(node.func, ast.Name):
                return node.func.id in QUERY_METHODS
        elif isinstance(node, ast.Attribute):
            # Consider any multi-level attribute access as a potential related field access
            return isinstance(node.value, ast.Attribute) and self.is_related_field_access(node)
        return False

    def is_multi_level_attribute(self, node: ast.Attribute) -> bool:
        """
        Check if an attribute node represents a potential ORM query through attribute access.
        """
        levels = 0
        current = node
        while isinstance(current, ast.Attribute):
            levels += 1
            current = current.value
            
            # Check if any level is a known Django queryset method
            if isinstance(current, ast.Attribute) and current.attr in QUERY_METHODS:
                return True

        # Consider it a potential N+1 query if there are at least two levels
        return levels >= 2

    def is_optimized(self, call_node: ast.AST, parent_queryset: ast.Call = None) -> bool:
        """
        Check if the queryset has been optimized with select_related or prefetch_related.
        """
        if parent_queryset:
            for parent_attr in ast.walk(parent_queryset):
                if isinstance(parent_attr, ast.Attribute) and parent_attr.attr in OPTIMIZATION_METHODS:
                    return True

        if isinstance(call_node, ast.Call) and isinstance(call_node.func, ast.Attribute):
            parent = call_node.func.value
        elif isinstance(call_node, ast.Attribute):
            parent = call_node.value
        else:
            return False

        while isinstance(parent, ast.Attribute):
            if parent.attr in OPTIMIZATION_METHODS:
                return True
            parent = parent.value

        return False
    
    def is_related_field_access(self, node: ast.Attribute) -> bool:
        """
        Check if an attribute access node is accessing a related field.
        """
        levels = []
        current = node
        while isinstance(current, ast.Attribute):
            levels.append(current.attr)
            current = current.value
        if isinstance(current, ast.Name):
            levels.append(current.id)
        
        if len(levels) > 1:  # More than one level usually indicates a related field
            return True
        return False

    def get_issues(self):
        return self.nplusone_issues
