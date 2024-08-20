import ast
import uuid
from typing import Any, Dict, List, Set, Tuple

from constants import WRITE_METHODS, QUERY_METHODS
from log import LOGGER

class SimplifiedN1Detector:
    QUERYSET_METHODS = {'filter', 'all', 'get', 'exclude', 'order_by', 'prefetch_related', 'select_related'}

    def __init__(self, source_code: str):
        self.source_code = source_code
        self.issues: List[Dict[str, Any]] = []
        self.found_querysets: Set[str] = set()
        self.optimized_querysets: Set[str] = set()
        self.optimized_variables: Dict[str, str] = {}
        LOGGER.debug("N+1 detection initialized")

    def analyze(self) -> List[Dict[str, Any]]:
        LOGGER.info("Starting analysis of source code")
        tree = ast.parse(self.source_code)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                LOGGER.debug("Analyzing function: %s", node.name)
                self.analyze_function(node)
        LOGGER.info("Analysis complete. Found %d issues", len(self.issues))
        return self.issues

    def analyze_function(self, node: ast.FunctionDef):
        LOGGER.debug("Finding optimized querysets in function: %s", node.name)
        self.find_optimized_querysets(node)
        LOGGER.debug("Querysets found: %s", self.found_querysets)
        LOGGER.debug("Optimized querysets found: %s", self.optimized_querysets)
        
        loops = self.find_loops(node)
        LOGGER.debug("Found %d loops in function %s", len(loops), node.name)
        for loop in loops:
            self.analyze_loop(node, loop)
        
        self.reset_cached_querysets_and_variables()
    
    def analyze_loop(self, func_node: ast.FunctionDef, loop_node: ast.AST):
        LOGGER.debug("Analyzing loop at line %d in function %s", loop_node.lineno, func_node.name)

        for child in ast.walk(loop_node):
            LOGGER.debug("Analyzing node of type: %s at line %d", type(child).__name__, getattr(child, 'lineno', None))

            if isinstance(child, ast.Assign):
                self.handle_assignment(child)

            elif isinstance(child, ast.For):
                self.handle_for_loop(child)

            elif isinstance(child, ast.Attribute):
                self.handle_attribute(child, func_node, loop_node)

            elif isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                self.handle_function_call(child, func_node, loop_node)

            elif self.is_potential_n1_query(child):
                self.handle_potential_n1_query(child, func_node, loop_node)

            else:
                LOGGER.debug("Node at line %d is not an N+1 query", getattr(child, 'lineno', None))

    def find_optimized_querysets(self, node: ast.AST):
        for child in ast.walk(node):
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                if child.func.attr in ['select_related', 'prefetch_related']:
                    queryset_name = self.get_queryset_name(child)
                    args = [arg.s for arg in child.args if isinstance(arg, ast.Constant)]
                    for arg in args:
                        # Split nested fields and add each level to optimized_querysets
                        fields = arg.split('__')
                        for i in range(len(fields)):
                            field_path = '__'.join(fields[:i + 1])
                            self.optimized_querysets.add(field_path.lower())
                    LOGGER.debug("Found optimized queryset: %s with nested fields: %s", queryset_name, args)

                method_name = child.func.attr
                if method_name in self.QUERYSET_METHODS:
                    queryset_name = self.get_queryset_name(child)
                    self.found_querysets.add(queryset_name)
                    LOGGER.debug("Found queryset: %s via method %s", queryset_name, method_name)

    def find_loops(self, node: ast.AST) -> List[ast.AST]:
        loops = [n for n in ast.walk(node)
            if isinstance(
                n, (ast.For, ast.While, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
            )
        ]
        LOGGER.debug("Found %d loops", len(loops))
        return loops

    def is_potential_n1_query(self, node: ast.AST) -> bool:
        if isinstance(node, ast.Attribute):
            chain = self.get_attribute_chain(node)
            full_chain = '__'.join(chain)
            
            LOGGER.debug("Checking full attribute chain: %s in node at line %d", full_chain, node.lineno)
            
            # Check if any part of the chain is optimized
            for i in range(len(chain)):
                sub_chain = '__'.join(chain[:i + 1])
                LOGGER.info("Checking sub-chain: %s", sub_chain)
                if chain[i] in self.optimized_querysets:
                    LOGGER.debug("Sub-chain %s found as optimized, skipping N+1 detection", chain[i])
                    return False
            
            LOGGER.info("N+1 query detected with full queryset chain: %s at line %d", full_chain, node.lineno)
            return True
        return False

    def check_call(self, node: ast.Call) -> bool:
        if isinstance(node.func, ast.Attribute):
            method_name = node.func.attr

            if method_name in self.QUERYSET_METHODS:
                queryset_name = self.get_queryset_name(node)
                is_optimized = queryset_name in self.optimized_querysets
                LOGGER.debug("Checking call to %s on queryset %s. Optimized: %s", method_name, queryset_name, is_optimized)
                return not is_optimized

            if method_name == 'all':
                base_name = self.get_queryset_name(node.func.value)
                if base_name in self.optimized_querysets:
                    LOGGER.debug("Found optimized related manager: %s", base_name)
                    return False

            # Recursively check for nested calls in case of chaining
            if isinstance(node.func.value, ast.Call):
                return self.check_call(node.func.value)
        
        elif isinstance(node.func, ast.Name):
            return node.func.id in list(QUERY_METHODS) + list(WRITE_METHODS)
        
        return False

    def add_issue(self, func_node: ast.FunctionDef, loop_node: ast.AST, query_node: ast.AST):
        if hasattr(query_node, 'lineno'):
            source_segment = ast.get_source_segment(self.source_code, query_node)
            queryset_name = self.get_queryset_name(query_node)
            is_optimized = queryset_name in self.optimized_querysets
            
            LOGGER.debug("Adding issue for queryset: %s (optimized: %s) in loop at line %d", 
                        queryset_name, is_optimized, loop_node.lineno)
            
            explanation, suggestion = self.get_explanation_and_suggestion(query_node, is_optimized)
            
            start_line, start_col = self.get_start_of_line(loop_node)
            end_line, end_col = self.get_end_of_line(query_node)
            
            issue = {
                'id': str(uuid.uuid4()),
                'function_name': func_node.name,
                'line': loop_node.lineno,
                'start_line': start_line,
                'end_line': end_line,
                'col_offset': start_col,
                'end_col_offset': end_col,
                'message': explanation,
                'problematic_code': source_segment,
                'is_optimized': is_optimized,
                'suggestion': suggestion,
            }

            self.issues.append(issue)
            LOGGER.info("Issue added: %s", issue)
        else:
            LOGGER.warning("Skipped node without line number %s", query_node)
        
    def get_attribute_chain(self, node: ast.AST) -> List[str]:
        chain = []
        while isinstance(node, ast.Attribute):
            chain.append(node.attr)
            node = node.value
        if isinstance(node, ast.Name):
            chain.append(node.id)
        return list(reversed(chain))

    def get_queryset_name(self, node: ast.AST) -> str:
        chain = []
        current_node = node

        while isinstance(current_node, (ast.Attribute, ast.Call)):
            if isinstance(current_node, ast.Call):
                current_node = current_node.func
            
            if isinstance(current_node, ast.Attribute):
                chain.append(current_node.attr)
                current_node = current_node.value

        if isinstance(current_node, ast.Name):
            chain.append(current_node.id)

        chain.reverse()
        queryset_name = '.'.join(chain)

        return queryset_name

    def get_explanation_and_suggestion(self, node: ast.AST, is_optimized: bool) -> Tuple[str, str]:
        LOGGER.debug("Generating explanation and suggestion for node at line %d", node.lineno)
        
        if is_optimized:
            explanation = "This queryset appears to be optimized, but there might still be room for improvement."
            suggestion = "Ensure that the optimization covers all necessary related fields."
            return explanation, suggestion

        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                method_name = node.func.attr
                if method_name in WRITE_METHODS:
                    return self.handle_write_operation(method_name)
                elif method_name == 'filter':
                    explanation = "A filter operation inside a loop may result in multiple database queries."
                    suggestion = "Consider using select_related() or prefetch_related() to optimize this query. If possible, try to move the filter operation outside the loop."
                elif method_name == 'get':
                    explanation = "Multiple 'get' operations inside a loop can lead to numerous database queries."
                    suggestion = "Consider using select_related() to prefetch related objects, or use filter() with specific fields to retrieve multiple objects at once."
                elif method_name == 'all':
                    explanation = "Fetching all objects and then accessing related objects can cause multiple queries."
                    suggestion = "Use select_related() or prefetch_related() to fetch related objects in a single query."
        elif isinstance(node, ast.Attribute):
            chain = self.get_attribute_chain(node)
            if len(chain) > 2:
                return self.handle_attribute_chain(chain)

        explanation = "This operation might lead to multiple database queries in a loop."
        suggestion = "Review this query to see if it can be optimized using select_related(), prefetch_related(), or by restructuring the code."

        LOGGER.debug("Generated explanation: %s", explanation)
        LOGGER.debug("Generated suggestion: %s", suggestion)
        return explanation, suggestion
    
    def handle_assignment(self, child: ast.Assign):
        LOGGER.debug("Analyzing assignment at line %d", child.lineno)
        for target in child.targets:
            if isinstance(target, ast.Name):
                variable_name = target.id
                LOGGER.debug("Assignment target variable: %s", variable_name)
                if isinstance(child.value, ast.Call) and isinstance(child.value.func, ast.Attribute):
                    model, relation_manager, method = self.split_chain(child.value)
                    LOGGER.debug("Assignment value is a call to method %s on relation manager %s for model %s", method, relation_manager, model)
                    if relation_manager and self.is_query_optimized(relation_manager):
                        LOGGER.debug("Assigning optimized queryset %s to variable %s", relation_manager, variable_name)
                        self.optimized_variables[variable_name] = relation_manager

    def handle_for_loop(self, child: ast.For):
        LOGGER.debug("Analyzing for-loop at line %d", child.lineno)
        if isinstance(child.iter, ast.Name):
            iter_variable = child.iter.id
            LOGGER.debug("For-loop iterating over variable: %s", iter_variable)
            if iter_variable in self.optimized_variables:
                LOGGER.debug("Iterating over optimized queryset: %s", self.optimized_variables[iter_variable])
                target_variable = child.target.id if isinstance(child.target, ast.Name) else None
                if target_variable:
                    LOGGER.debug("Loop variable %s is from optimized queryset %s", target_variable, self.optimized_variables[iter_variable])
                    self.optimized_variables[target_variable] = self.optimized_variables[iter_variable]

    def handle_attribute(self, child: ast.Attribute, func_node: ast.FunctionDef, loop_node: ast.AST):
        chain = self.get_attribute_chain(child)
        variable_name = chain[0]
        LOGGER.debug("Analyzing attribute access at line %d: %s", child.lineno, '.'.join(chain))
        if variable_name in self.optimized_variables:
            LOGGER.debug("Variable %s is optimized (from %s)", variable_name, self.optimized_variables[variable_name])

    def handle_function_call(self, child: ast.Call, func_node: ast.FunctionDef, loop_node: ast.AST):
        LOGGER.debug("Analyzing function call at line %d", child.lineno)
        model, relation_manager, method = self.split_chain(child)
        if relation_manager:
            if isinstance(child.func.value, ast.Name):
                variable_name = child.func.value.id
                LOGGER.debug("Checking if variable %s is optimized", variable_name)
                if variable_name in self.optimized_variables:
                    LOGGER.debug("Variable %s is optimized from relation manager %s", variable_name, self.optimized_variables[variable_name])
                    return
            if self.is_query_optimized(relation_manager):
                LOGGER.debug("Relation manager %s is optimized", relation_manager)
                return
        LOGGER.info("Potential N+1 query found at line %d in loop at line %d: relation manager %s", child.lineno, loop_node.lineno, relation_manager)
        self.add_issue(func_node, loop_node, child)

    def handle_potential_n1_query(self, child: ast.AST, func_node: ast.FunctionDef, loop_node: ast.AST):
        LOGGER.info("Potential N+1 query found at line %d in loop at line %d", child.lineno, loop_node.lineno)
        self.add_issue(func_node, loop_node, child)

    def handle_write_operation(self, method_name: str) -> Tuple[str, str]:
        if method_name == 'create':
            explanation = "Multiple create operations inside a loop can lead to excessive database writes."
            suggestion = "Consider using bulk_create() to create multiple objects in a single query."
        elif method_name == 'update':
            explanation = "Multiple update operations inside a loop can lead to excessive database writes."
            suggestion = "Consider using bulk_update() to update multiple objects in a single query, or update() with a filter to affect multiple objects at once."
        elif method_name == 'save':
            explanation = "Multiple save operations inside a loop can lead to excessive individual database writes."
            suggestion = "Consider using bulk_create() or bulk_update() instead of individual save() calls. If using save() for updates, you might also consider using update() on a queryset."
        elif method_name == 'delete':
            explanation = "Multiple delete operations inside a loop can lead to excessive individual database deletes."
            suggestion = "Consider using bulk_delete() or delete() on a queryset to remove multiple objects in a single query."
        else:
            explanation = f"Multiple {method_name} operations inside a loop can lead to excessive database operations."
            suggestion = f"Review if {method_name} can be optimized or batched to reduce the number of database operations."
        
        return explanation, suggestion

    def handle_attribute_chain(self, chain: List[str]) -> Tuple[str, str]:
        explanation = f"Accessing nested related objects ({'.'.join(chain)}) within a loop can trigger additional queries."
        field_to_optimize = chain[1] if chain[0] != 'objects' else chain[2]
        suggestion = f"Consider using select_related('{field_to_optimize}') or prefetch_related('{field_to_optimize}') to optimize this query."
        return explanation, suggestion
    
    def get_start_of_line(self, node: ast.AST) -> Tuple[int, int]:
        line = node.lineno
        col_offset = len(self.source_code.splitlines()[line - 1]) - len(self.source_code.splitlines()[line - 1].lstrip())
        LOGGER.debug("Start of line %d: col %d", line, col_offset)
        return line, col_offset

    def get_end_of_line(self, node: ast.AST) -> Tuple[int, int]:
        line = node.end_lineno if hasattr(node, 'end_lineno') else node.lineno
        end_col = len(self.source_code.splitlines()[line - 1].rstrip())
        LOGGER.debug("End of line %d: col %d", line, end_col)
        return line, end_col
    
    def split_chain(self, node: ast.AST) -> Tuple[str, str, str]:
        """
        Splits the chain into three components: model, relation manager, and method.
        """
        chain = []
        current_node = node
        LOGGER.info("Splitting chain for node: %s", node)

        while isinstance(current_node, (ast.Attribute, ast.Call)):
            if isinstance(current_node, ast.Call):
                method = current_node.func.attr if isinstance(current_node.func, ast.Attribute) else None
                current_node = current_node.func
            elif isinstance(current_node, ast.Attribute):
                chain.append(current_node.attr)
                current_node = current_node.value
        
        if isinstance(current_node, ast.Name):
            model = current_node.id
            chain.reverse()
            relation_manager = chain[0] if len(chain) > 0 else None
            method = chain[-1] if len(chain) > 1 else None
            return model, relation_manager, method

        return None, None, None

    def is_query_optimized(self, relation_manager: str) -> bool:
        """
        Checks if the relation manager is optimized.
        """
        LOGGER.info(f"Checking if relation manager {relation_manager} is in optimized querysets: {self.optimized_querysets}")
        if relation_manager in self.optimized_querysets:
            LOGGER.debug("Relation manager %s is optimized", relation_manager)
            return True
        return False
    
    def reset_cached_querysets_and_variables(self):
        self.found_querysets.clear()
        self.optimized_querysets.clear()
        self.optimized_variables.clear()
        LOGGER.debug("Cached querysets and children cleared")