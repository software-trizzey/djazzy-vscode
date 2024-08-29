import ast
import uuid

from typing import List, Dict, Any, Set

from log import LOGGER
from constants import QUERY_METHODS

from nplusone.scorer import NPlusOneScorer

class GlobalContext:
    def __init__(self):
        self.optimized_querysets: Set[ast.AST] = set()
        self.optimized_variables: Dict[str, ast.AST] = {}
        self.variable_assignments: Dict[str, ast.AST] = {}

    def add_optimized_queryset(self, queryset_node: ast.AST):
        LOGGER.debug(f"Adding optimized queryset: {queryset_node}")
        self.optimized_querysets.add(queryset_node)
        LOGGER.debug(f"Optimized querysets: {self.optimized_querysets}")

    def add_optimized_variable(self, var_node: ast.AST, queryset_node: ast.AST):
        LOGGER.debug(f"Tracking variable: {var_node.id} -> {queryset_node}")
        self.optimized_variables[var_node.id] = queryset_node
        LOGGER.debug(f"Optimized variables: {self.optimized_variables}")

    def is_queryset_optimized(self, queryset_node: ast.AST) -> bool:
        LOGGER.debug(f"Checking if queryset is optimized: {queryset_node}")
        LOGGER.debug(f"Current optimized querysets: {self.optimized_querysets}")
        return queryset_node in self.optimized_querysets
    
    def is_variable_optimized(self, var_node: ast.AST) -> bool:
        is_optimized = var_node in self.optimized_variables
        LOGGER.debug(f"Checking if variable is optimized: {var_node} {is_optimized}")
        return is_optimized

    def get_queryset_for_variable(self, var_node: ast.AST) -> ast.AST:
        LOGGER.debug(f"Trying to get queryset for variable: {var_node} {type(var_node)} {self.optimized_variables}")
        return self.optimized_variables.get(var_node.id)
    
    def add_variable_assignment(self, var_node: ast.Name, assigned_value: ast.AST):
        LOGGER.debug(f"Tracking variable assignment: {var_node.id} -> {assigned_value}")
        self.variable_assignments[var_node.id] = assigned_value
        LOGGER.debug(f"Variable assignments: {self.variable_assignments}")

    def get_variable_assignment(self, var_node: ast.AST) -> ast.AST:
        if isinstance(var_node, ast.Name):
            return self.variable_assignments.get(var_node.id)
        LOGGER.debug(f"Variable assignment lookup skipped for non-Name node: {ast.dump(var_node)}")
        return None


class ParentAwareNodeVisitor(ast.NodeVisitor):
    def __init__(self):
        self.parent_map = {}

    def visit(self, node):
        for child in ast.iter_child_nodes(node):
            self.parent_map[child] = node
            self.visit(child)
        super().visit(node)

    def get_parent(self, node):
        return self.parent_map.get(node)


class NPlusOneDetector:
    def __init__(self, source_code: str, model_cache: Dict[str, Any] = None):
        self.source_code = source_code
        self.model_cache = model_cache
        self.issues: List[Dict[str, Any]] = []
        self.global_context = GlobalContext()
        self.detected_chains_global = set()

        LOGGER.info(f"Initializing N+1 detector with models: {model_cache}")

    def analyze(self) -> List[Dict[str, Any]]:
        tree = ast.parse(self.source_code)

        # First pass: find all querysets and optimizations in the file
        self.find_optimized_querysets(tree)

        # Second pass: analyze the usage of querysets in loops and other parts
        self.analyze_usage(tree)

        self.issues = NPlusOneScorer.calculate_issue_scores(self.issues)

        LOGGER.info(f"Analysis complete. Total issues found: {len(self.issues)}")
        return self.issues
    
    def is_valid_model_queryset(self, queryset_name: str) -> bool:
        """
        Check if the root queryset corresponds to a known model in the model cache.
        """
        if not queryset_name or '.' not in queryset_name:
            return False
        
        root_model_name = queryset_name.split('.')
        if len(root_model_name) == 0:
            return False
        
        root_model_name = root_model_name[0]
        return root_model_name in self.model_cache

    def find_optimized_querysets(self, tree: ast.AST):
        LOGGER.info("Finding optimized querysets...")
        
        # First pass: Detect and store optimized querysets
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if node.func.attr in ['select_related', 'prefetch_related']:
                    queryset_name = self.get_queryset_name(node)
                    if queryset_name:
                        self.global_context.add_optimized_queryset(node)
                        LOGGER.debug(f"Optimized query set node with name: {node} {queryset_name}")
        
        # Second pass: Process variable assignments after optimizations are known
        LOGGER.debug("\nProcessing queryset variable assignments...")
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                self.track_variable_assignment_for_lookup(node)
                target = node.targets[0]
                if isinstance(target, ast.Name) and isinstance(node.value, ast.Call):
                    queryset_name = self.get_queryset_name(node.value)
                    LOGGER.debug(f"Checking variable assignment: {target} {node.value} {queryset_name}")
                    if self.global_context.is_queryset_optimized(node.value):
                        LOGGER.debug(f"Found optimized queryset for variable: {node}")
                        self.global_context.add_optimized_variable(target, node.value)

    def analyze_usage(self, tree: ast.AST):
        LOGGER.debug("\n\nAnalyzing queryset usage...")
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                self.analyze_function(node)

    def analyze_function(self, node: ast.FunctionDef):
        LOGGER.debug(f"Analyzing function: {node.name}")
        for subnode in ast.walk(node):
            if isinstance(subnode, ast.For):
                self.analyze_loop(subnode)

    def analyze_loop(self, loop: ast.For):
        if isinstance(loop.target, ast.Name) and isinstance(loop.iter, ast.Name):
            self.process_loop_target_and_iterable(loop.target, loop.iter)

        self.process_loop_nodes(loop)

    def track_variable_assignment(self, node: ast.AST, queryset_name: str):
        if queryset_name:
            LOGGER.debug(f"Is variable assigned to optimized queryset? {queryset_name}", )
            if self.global_context.is_queryset_optimized(node):
                LOGGER.debug(f"Tracking variable assignment for optimized queryset: {node} {queryset_name}")
                if isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            LOGGER.debug(f"Tracking variable assignment for optimized queryset: {target.id}")
                            self.global_context.add_optimized_variable(target, node)
            else:
                LOGGER.debug(f"Queryset is not optimized {queryset_name}")

    def track_variable_assignment_for_lookup(self, node: ast.Assign):
        """Helper method to track variable assignments for future lookups."""
        target = node.targets[0]
        if isinstance(target, ast.Name):
            print(f"Variable {target.id} assigned to {node.value}")
            self.global_context.add_variable_assignment(target, node.value)
            LOGGER.debug(f"Tracked assignment for {target.id} -> {node.value}")

    def is_queryset_or_variable_optimized(self, node: ast.AST) -> bool:
        if self.global_context.is_variable_optimized(node):
            LOGGER.debug(f"Loop variable is optimized: {node}")
            return True
        LOGGER.debug(f"Checking if queryset NODE is optimized: {ast.dump(node, annotate_fields=True)}")
        if isinstance(node, ast.Attribute):
            LOGGER.debug(f"Node is an attribute {node.value.id}")
            queryset_node = self.global_context.get_queryset_for_variable(node.value)
        else:
            queryset_node = self.global_context.get_queryset_for_variable(node)
        return queryset_node and self.global_context.is_queryset_optimized(queryset_node)

    def get_root_queryset_name(self, node: ast.Attribute) -> str:
        while isinstance(node, ast.Attribute):
            node = node.value
            if isinstance(node, ast.Name):
                return node.id
            return ''

    def get_full_attribute_chain(self, node: ast.Attribute) -> str:
        chain = []
        current_node = node
        while isinstance(current_node, ast.Attribute):
            chain.append(current_node.attr)
            current_node = current_node.value
        if isinstance(current_node, ast.Name):
            chain.append(current_node.id)
        return '.'.join(reversed(chain))

    def get_queryset_name(self, node: ast.Call) -> str:
        # Handle the case when the node is an attribute (e.g., user.profile)
        if isinstance(node.func, ast.Attribute):
            LOGGER.debug(f"Getting queryset name (attribute): {node.func}")
            return self.get_full_attribute_chain(node.func)
        
        # Handle the case when the node is a simple variable (e.g., User.objects.all())
        elif isinstance(node.func, ast.Name):
            LOGGER.debug(f"Getting queryset name (name): {node.func.id}")
            return node.func.id
        
        return ''
    
    def get_complete_queryset(self, node: ast.AST) -> str:
        """
        Recursively traverses the AST to reconstruct the full queryset expression.
        """
        if isinstance(node, ast.Call):
            func_str = self.get_complete_queryset(node.func)
            args_str = ', '.join([self.get_argument_value(arg) for arg in node.args])
            return f"{func_str}({args_str})"
        
        elif isinstance(node, ast.Attribute):
            value_str = self.get_complete_queryset(node.value)
            return f"{value_str}.{node.attr}"
        
        elif isinstance(node, ast.Name):
            return node.id
        
        return ''
    
    def get_function_name(self, node: ast.Call) -> str:
        """
        Extracts the name of the function being called from an ast.Call node.
        
        :param node: The ast.Call node representing the function call.
        :return: The name of the function being called as a string.
        """
        if isinstance(node.func, ast.Name):
            # The function is directly called (e.g., func())
            LOGGER.debug(f"Function name (name): {node.func.id}")
            return node.func.id
        elif isinstance(node.func, ast.Attribute):
            LOGGER.debug(f"Function name (attribute): {node.func.attr}")
            return node.func.attr
        else:
            LOGGER.debug(f"Function name might be too complex for this check: {ast.dump(node.func)}")
            return ""

    def get_argument_value(self, arg: ast.AST) -> str:
        """
        Converts AST argument nodes into readable strings.
        """
        if isinstance(arg, ast.Constant):  # Python 3.8+
            return repr(arg.value)  # Handles strings, numbers, etc.
        elif isinstance(arg, ast.Name):
            return arg.id
        return ast.dump(arg)
    
    def process_loop_target_and_iterable(self, loop_target: ast.Name, loop_iter: ast.Name):
        queryset_name = loop_iter.id
        loop_var_name = loop_target.id

        assigned_value = self.global_context.get_variable_assignment(loop_iter)
        if assigned_value:
            complete_queryset = self.get_complete_queryset(assigned_value)
            LOGGER.debug(f"Found assigned value for loop variable: {loop_iter.id} -> {assigned_value} -> {complete_queryset}")

            if isinstance(assigned_value, ast.List) or isinstance(assigned_value, ast.Dict):
                LOGGER.info(f"Skipping loop analysis for non-queryset iterable: {loop_iter.id}")
                return
            
            if complete_queryset and not self.is_valid_model_queryset(complete_queryset):
                LOGGER.info(f"Skipping loop analysis for non-model queryset: {complete_queryset}")
                return

        LOGGER.debug(f"Linking loop variable '{loop_var_name}' to queryset '{queryset_name}'")
        LOGGER.debug(f"Loop iter node {loop_iter} and variable node {loop_target}")
        queryset_node = self.global_context.get_queryset_for_variable(loop_iter)
        LOGGER.debug(f"Loop Queryset node: {queryset_node}")
        if queryset_node:
            self.global_context.add_optimized_variable(loop_target, queryset_node)

    def process_loop_nodes(self, loop: ast.For):
        visitor = ParentAwareNodeVisitor()
        visitor.visit(loop)

        for node in ast.walk(loop):
            if isinstance(node, ast.Call):
                function_name = self.get_function_name(node)
                LOGGER.debug(f"Processing function call: {function_name}")

                if function_name in QUERY_METHODS:
                    LOGGER.debug(f"Found query method: {function_name}")
                    queryset_chain = self.get_full_attribute_chain(node.func)
                    LOGGER.debug(f"Queryset chain: {queryset_chain}")
                    # Filter out more general chains ("Product.objects") before adding a more specific one ("Product.objects.filter()"")
                    is_redundant = any(existing_chain.startswith(queryset_chain) for existing_chain in self.detected_chains_global)
                    if not is_redundant:
                        LOGGER.debug(f"Identified new queryset chain: {queryset_chain}")
                        self.detected_chains_global.add(queryset_chain)
                        self.add_issue(loop, node, queryset_chain)

            if isinstance(node, ast.Attribute):
                parent_node = visitor.get_parent(node)
                LOGGER.debug(f"Parent node {ast.dump(parent_node, annotate_fields=True)} type {type(parent_node)} of attribute node {node.attr}")
                if (isinstance(parent_node, ast.keyword) and isinstance(node.ctx, ast.Load)):
                    LOGGER.debug(f"Skipping attribute {node.attr} as it's part of a function call: {ast.dump(parent_node)}")
                    continue
                elif (isinstance(parent_node, ast.Assign) and isinstance(node.ctx, ast.Store)):
                    LOGGER.debug(f"Skipping attribute {node.attr} as it's part of an assignment: {ast.dump(parent_node)}")
                    continue

                if self.global_context.get_variable_assignment(loop.iter) and isinstance(self.global_context.get_variable_assignment(loop.iter), ast.List):
                    LOGGER.debug(f"Skipping attribute {node.attr} since it belongs to a non-queryset iterable.")
                    continue

                full_chain = self.get_full_attribute_chain(node)
                LOGGER.debug(f"Full chain: {full_chain}")
                LOGGER.debug(f"Current chains: {self.detected_chains_global}")

                is_redundant = any(existing_chain.startswith(full_chain) for existing_chain in self.detected_chains_global)
                if is_redundant:
                    LOGGER.debug(f"Skipping chain: {full_chain} as it is redundant")
                    continue

                root_queryset_name = self.get_root_queryset_name(node)
                LOGGER.debug(f"Root queryset name: {root_queryset_name}")
                if root_queryset_name and not self.is_queryset_or_variable_optimized(node):
                    LOGGER.debug(f"Found issue for chain: {full_chain}")
                    self.detected_chains_global.add(full_chain)
                    self.add_issue(loop, node, full_chain)

    def add_issue(self, loop: ast.AST, node: ast.AST, attr_chain: str):
        """
        Add a detailed N+1 query issue to the list of issues.
        """
        issue = {
            'id': str(uuid.uuid4()),
            'line': node.lineno,
            'start_line': loop.lineno,
            'end_line': node.end_lineno if hasattr(node, 'end_lineno') else node.lineno,
            'col_offset': loop.col_offset,
            'end_col_offset': node.end_col_offset if hasattr(node, 'end_col_offset') else node.col_offset,
            'message': f"Potential N+1 query detected at line {node.lineno}: {attr_chain}",
            'problematic_code': self.get_problematic_code(node),
            'suggestion': "Consider using select_related() or prefetch_related() to optimize this query.",
        }
        LOGGER.debug(f"Adding issue: {issue}")
        self.issues.append(issue)

    def get_enclosing_function_name(self, node: ast.AST) -> str:
        """
        Get the name of the function enclosing the node, if available.
        """
        current_node = node
        while current_node:
            if isinstance(current_node, ast.FunctionDef):
                return current_node.name
            current_node = getattr(current_node, 'parent', None)
        return "Unknown"

    def get_problematic_code(self, node: ast.AST) -> str:
        """
        Get the code snippet that is considered problematic.
        Extracts the exact line(s) of code from the source code based on the node's location.
        """
        start_line = node.lineno
        end_line = getattr(node, 'end_lineno', start_line)
        source_lines = self.source_code.splitlines()
        
        problematic_code_lines = source_lines[start_line - 1:end_line]
        problematic_code = '\n'.join(problematic_code_lines).strip()

        return problematic_code