import ast
from typing import Dict, Any

from .services.ast_visitor import ASTVisitor
from .services.queryset_tracker import QuerysetTracker
from .services.query_analyzer import QueryAnalyzer
from .services.issue_reporter import IssueReporter
from .services.llm_service import LLMService

from constants import OPTIMIZATION_METHODS
from log import LOGGER

class NPlusOneAnalyzer:
    def __init__(self, source_code: str, model_cache: Dict[str, Any], api_server_json: Dict[str, Any]):
        self.source_code = source_code
        self.model_cache = model_cache
        self.queryset_tracker = QuerysetTracker()
        self.query_analyzer = QueryAnalyzer(self.queryset_tracker)
        self.issue_reporter = IssueReporter(source_code)
        self.llm_service = LLMService(api_server_json)

        LOGGER.debug(f"Initialized NPlusOneAnalyzer with {len(self.model_cache)} models")

    def analyze(self):
        LOGGER.debug("Analyzing source code")
        tree = ast.parse(self.source_code)
        self.find_optimized_querysets(tree)
        
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                self.analyze_function(node)

        return self.issue_reporter.issues

    def find_optimized_querysets(self, node: ast.AST):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute) and child.func.attr in OPTIMIZATION_METHODS:
                base_model = ASTVisitor.get_base_model(child.func.value)
                for arg in child.args:
                    if isinstance(arg, ast.Constant):
                        self.queryset_tracker.add_optimized_field(base_model, arg.s)
            self.find_optimized_querysets(child)

    def analyze_function(self, node: ast.FunctionDef):
        loops = ASTVisitor.find_loops(node)
        for loop in loops:
            self.analyze_loop(node, loop)

    def analyze_loop(self, func_node: ast.FunctionDef, loop_node: ast.AST):
        LOGGER.info(f"Analyzing loop {loop_node} in function {func_node.name}")
        for child in ast.walk(loop_node):
            LOGGER.debug(f"Checking child {child}")
            if self.query_analyzer.is_potential_n_plus_one(child, loop_node):
                base_model = self.query_analyzer.get_base_model(child)
                field = self.query_analyzer.extract_related_field(child)
                LOGGER.debug(f"Potential N+1 query detected: {base_model}.{field}")
                
                if base_model and field:
                    LOGGER.debug(f"Checking optimization for {base_model}.{field}")
                    context = {
                        "function_body": ast.unparse(func_node),
                        "model_info": self.model_cache.get(base_model, {}),
                        "optimized_querysets": self.queryset_tracker.optimized_querysets,
                        "base_model": base_model,
                        "field": field,
                        "query_type": self.query_analyzer.get_query_type(child),
                    }
                    
                    is_optimized = self.llm_service.validate_optimization(context)
                    LOGGER.debug(f"Optimization status for {base_model}.{field}: {is_optimized}")
                    
                    if not is_optimized:
                        LOGGER.debug(f"Adding issue for {base_model}.{field}")
                        self.issue_reporter.add_issue(
                            func_node, 
                            loop_node, 
                            child, 
                            self.query_analyzer,
                            explanation="Potential N+1 query detected by LLM"
                        )

    def clear_tracker(self):
        self.queryset_tracker.clear()