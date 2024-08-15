import ast
import uuid
from typing import Any, Dict, List


class SimplifiedN1Detector:
    def __init__(self, source_code: str):
        self.source_code = source_code
        self.issues: List[Dict[str, Any]] = []

    def analyze(self) -> List[Dict[str, Any]]:
        tree = ast.parse(self.source_code)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                self.analyze_function(node)
        return self.issues

    def analyze_function(self, node: ast.FunctionDef):
        loops = self.find_loops(node)
        for loop in loops:
            self.analyze_loop(node, loop)

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
        self.issues.append({
            'id': str(uuid.uuid4()),
            'function_name': func_node.name,
            'line': query_node.lineno,
            'col_offset': query_node.col_offset,
            'end_col_offset': query_node.col_offset + len(source_segment),
            'message': f"Potential N+1 query detected: {source_segment}",
            'problematic_code': source_segment,
            'start_line': loop_node.lineno,
            'end_line': query_node.lineno,
        })
    
    def get_attribute_chain(self, node: ast.AST) -> List[str]:
        chain = []
        while isinstance(node, ast.Attribute):
            chain.append(node.attr)
            node = node.value
        if isinstance(node, ast.Name):
            chain.append(node.id)
        return list(reversed(chain))

