import ast
import uuid
from typing import Any, Dict, List, Set, Tuple


class SimplifiedN1Detector:
    def __init__(self, source_code: str):
        self.source_code = source_code
        self.issues: List[Dict[str, Any]] = []
        self.optimized_querysets: Set[str] = set()

    def analyze(self) -> List[Dict[str, Any]]:
        tree = ast.parse(self.source_code)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                self.analyze_function(node)
        return self.issues

    def analyze_function(self, node: ast.FunctionDef):
        self.find_optimized_querysets(node)
        loops = self.find_loops(node)
        for loop in loops:
            self.analyze_loop(node, loop)

    def find_optimized_querysets(self, node: ast.AST):
        for child in ast.walk(node):
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                if child.func.attr in ['select_related', 'prefetch_related']:
                    if isinstance(child.func.value, ast.Name):
                        self.optimized_querysets.add(child.func.value.id)

    def find_loops(self, node: ast.AST) -> List[ast.AST]:
        return [n for n in ast.walk(node)
            if isinstance(
                n, (ast.For, ast.While, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
            )
        ]

    def analyze_loop(self, func_node: ast.FunctionDef, loop_node: ast.AST):
        for child in ast.walk(loop_node):
            if self.is_potential_n1_query(child):
                self.add_issue(func_node, loop_node, child)

    def is_potential_n1_query(self, node: ast.AST) -> bool:
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                return node.func.attr in ['filter', 'get', 'all']
        elif isinstance(node, ast.Attribute):
            return len(self.get_attribute_chain(node)) > 2
        return False

    def add_issue(self, func_node: ast.FunctionDef, loop_node: ast.AST, query_node: ast.AST):
        source_segment = ast.get_source_segment(self.source_code, query_node)
        queryset_name = self.get_queryset_name(query_node)
        is_optimized = queryset_name in self.optimized_querysets
        
        explantion, suggestion = self.get_explanation_and_suggestion(query_node, is_optimized)

        self.issues.append({
            'id': str(uuid.uuid4()),
            'function_name': func_node.name,
            'line': query_node.lineno,
            'col_offset': query_node.col_offset,
            'end_col_offset': query_node.col_offset + len(source_segment),
            'message': explantion,
            'problematic_code': source_segment,
            'start_line': loop_node.lineno,
            'end_line': query_node.lineno,
            'is_optimized': is_optimized,
            'suggestion': suggestion,
        })
    
    def get_attribute_chain(self, node: ast.AST) -> List[str]:
        chain = []
        while isinstance(node, ast.Attribute):
            chain.append(node.attr)
            node = node.value
        if isinstance(node, ast.Name):
            chain.append(node.id)
        return list(reversed(chain))

    def get_queryset_name(self, node: ast.AST) -> str:
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            return self.get_queryset_name(node.func.value)
        elif isinstance(node, ast.Attribute):
            return self.get_queryset_name(node.value)
        elif isinstance(node, ast.Name):
            return node.id
        return ""

    def get_explanation_and_suggestion(self, node: ast.AST, is_optimized: bool) -> Tuple[str, str]:
        if is_optimized:
            explanation = "This queryset appears to be optimized, but there might still be room for improvement."
            suggestion = "Ensure that the optimization covers all necessary related fields."
            return explanation, suggestion

        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                if node.func.attr == 'filter':
                    explanation = "A filter operation inside a loop may result in multiple database queries."
                    suggestion = "Consider using select_related() or prefetch_related() to optimize this query."
                elif node.func.attr == 'get':
                    explanation = "Multiple 'get' operations inside a loop can lead to numerous database queries."
                    suggestion = "If this 'get' operation is inside a loop, consider prefetching the data or moving the query outside the loop."
                elif node.func.attr == 'all':
                    explanation = "Fetching all objects and then accessing related objects can cause multiple queries."
                    suggestion = "If you're accessing related objects, consider using select_related() or prefetch_related()."
        elif isinstance(node, ast.Attribute):
            chain = self.get_attribute_chain(node)
            if len(chain) > 2:
                explanation = f"Accessing nested related objects ({'.'.join(chain)}) within a loop can trigger additional queries."
                suggestion = f"Consider using select_related('{chain[1]}') to prefetch this related object."
        else:
            explanation = "This operation might lead to multiple database queries in a loop."
            suggestion = "Review this query to see if it can be optimized using select_related(), prefetch_related(), or by restructuring the code."

        return explanation, suggestion