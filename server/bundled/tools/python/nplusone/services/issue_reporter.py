import ast
import uuid

from log import LOGGER
from .query_analyzer import QueryAnalyzer

class IssueReporter:
    def __init__(self, source_code: str):
        self.issues = []
        self.source_code = source_code

    def add_issue(self, func_node: ast.FunctionDef, loop_node: ast.AST, call_node: ast.AST, query_analyzer: QueryAnalyzer):
        LOGGER.debug(f"Adding N+1 issue in function {func_node.name} at line {call_node.lineno}")
        source_segment = ast.get_source_segment(self.source_code, call_node)
        related_field = query_analyzer.extract_related_field(call_node)
        query_type = query_analyzer.get_query_type(call_node)
        issue_message = self.create_issue_message(
            source_segment, query_type, related_field, related_field is not None, False
        )

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
                'is_related_field_access': None,
                'is_bulk_operation': query_type == "bulk",
            },
            'start_line': getattr(loop_node, 'lineno', call_node.lineno),
            'end_line': call_node.lineno,
            'issue_type': "N+1 Query"
        }
        self.issues.append(issue_detail)

    def create_issue_message(
        self,
        source_segment: str,
        query_type: str,
        related_field: str,
        is_related_field_access: bool,
        is_bulk_operation: bool
    ) -> str:
        if query_type == "read":
            if is_bulk_operation:
                return f"Potential Inefficient Bulk Read Operation: {source_segment}\n\n" \
                    f"Using a bulk read operation in a loop might still be inefficient. " \
                    "Consider restructuring the query to avoid the loop if possible."
            else:
                return f"Potential N+1 Query Detected: {source_segment}\n\n" \
                    f"Using a read operation in a loop can cause multiple database queries (N+1 issue). " \
                    "Consider using `select_related` or `prefetch_related` to optimize."
        elif query_type == "write":
            if is_bulk_operation:
                return f"Bulk Write Operation in Loop: {source_segment}\n\n" \
                    f"Using a bulk write operation in a loop might still be inefficient. " \
                    "Consider collecting data and performing a single bulk operation outside the loop."
            else:
                return f"Repetitive Write Operation Detected: {source_segment}\n\n" \
                    "Performing individual write operations in a loop can be inefficient. " \
                    "Consider using bulk create or update operations if possible."
        elif is_related_field_access:
            return f"Potential N+1 Query Detected: {source_segment}\n\n" \
                f"Accessing the related field '{related_field}' in a loop can cause multiple database queries (N+1 issue). " \
                "Consider using `select_related` or `prefetch_related` to optimize."
        else:
            return f"Potential Inefficient Database Operation: {source_segment}\n\n" \
                "This operation in a loop might lead to multiple database queries. " \
                "Consider optimizing the query structure."