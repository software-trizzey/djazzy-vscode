import ast
from typing import List, Dict, Any, Set

class GlobalContext:
    def __init__(self):
        self.optimized_querysets: Set[ast.AST] = set()
        self.optimized_variables: Dict[str, ast.AST] = {}

    def add_optimized_queryset(self, queryset_node: ast.AST):
        print(f"Adding optimized queryset: {queryset_node}", type(queryset_node))
        self.optimized_querysets.add(queryset_node)
        print("Optimized querysets:", self.optimized_querysets)

    def add_optimized_variable(self, var_node: ast.AST, queryset_node: ast.AST):
        print(f"Tracking variable: {var_node.id} -> {queryset_node}")
        self.optimized_variables[var_node.id] = queryset_node
        print("Optimized variables:", self.optimized_variables)

    def is_queryset_optimized(self, queryset_node: ast.AST) -> bool:
        print("Checking if queryset is optimized:", queryset_node, type(queryset_node), queryset_node in self.optimized_querysets)
        print("Current optimized querysets:", self.optimized_querysets)
        return queryset_node in self.optimized_querysets
    
    def is_variable_optimized(self, var_node: ast.AST) -> bool:
        is_optimized = var_node in self.optimized_variables
        print("Checking if variable is optimized:", var_node, is_optimized)
        return is_optimized

    def get_queryset_for_variable(self, var_node: ast.AST) -> ast.AST:
        print("Trying to get queryset for variable:", var_node, type(var_node), self.optimized_variables)
        return self.optimized_variables.get(var_node.id)

class NPlusOneDetector:
    def __init__(self, source_code: str):
        self.source_code = source_code
        self.issues: List[Dict[str, Any]] = []
        self.global_context = GlobalContext()

    def analyze(self) -> List[Dict[str, Any]]:
        tree = ast.parse(self.source_code)

        # First pass: find all querysets and optimizations in the file
        self.find_optimized_querysets(tree)

        # Second pass: analyze the usage of querysets in loops and other parts
        self.analyze_usage(tree)

        print(f"Analysis complete. Total issues found: {len(self.issues)}")
        return self.issues

    def find_optimized_querysets(self, tree: ast.AST):
        print("Finding optimized querysets...")
        
        # First pass: Detect and store optimized querysets
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if node.func.attr in ['select_related', 'prefetch_related']:
                    queryset_name = self.get_queryset_name(node)
                    if queryset_name:
                        self.global_context.add_optimized_queryset(node)
                        print("Optimized query set node with name:", node, queryset_name)
        
        # Second pass: Process variable assignments after optimizations are known
        print("\nProcessing queryset variable assignments...")
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                target = node.targets[0]
                if isinstance(target, ast.Name) and isinstance(node.value, ast.Call):
                    queryset_name = self.get_queryset_name(node.value)
                    print("Checking variable assignment:", target, node.value, queryset_name)
                    if self.global_context.is_queryset_optimized(node.value):
                        print("Found optimized queryset for variable:", node)
                        self.global_context.add_optimized_variable(target, node.value)

    def analyze_usage(self, tree: ast.AST):
        print("\n\nAnalyzing queryset usage...")
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                self.analyze_function(node)

    def analyze_function(self, node: ast.FunctionDef):
        print(f"Analyzing function: {node.name}")
        for subnode in ast.walk(node):
            if isinstance(subnode, ast.For):
                self.analyze_loop(subnode)

    def analyze_loop(self, loop: ast.For):
        detected_outermost_chains = set() 

        if isinstance(loop.target, ast.Name) and isinstance(loop.iter, ast.Name):
            # Loop variable (e.g., "user") is linked to the iterable (e.g., "users")
            queryset_name = loop.iter.id
            loop_var_name = loop.target.id
            print(f"Linking loop variable '{loop_var_name}' to queryset '{queryset_name}'")
            print(f"Loop iter node {loop.iter} and variable node {loop.target}")
            queryset_node = self.global_context.get_queryset_for_variable(loop.iter)
            print("Loop Queryset node:", queryset_node)
            if queryset_node:
                self.global_context.add_optimized_variable(loop.target, queryset_node)

        for node in ast.walk(loop):
            if isinstance(node, ast.Attribute):
                full_chain = self.get_full_attribute_chain(node)
                print("Full chain:", full_chain)
                print("detected chains:", detected_outermost_chains)

                if not any(full_chain == detected_chain or detected_chain.startswith(full_chain) for detected_chain in detected_outermost_chains):
                    root_queryset_name = self.get_root_queryset_name(node)
                    print("Root node:", node)
                    print("Root queryset:", root_queryset_name)
                    
                    if root_queryset_name and not self.is_queryset_or_variable_optimized(node):
                        print("Found issue for chain:", full_chain)
                        detected_outermost_chains.add(full_chain)
                        self.add_issue(loop, node, full_chain)

    def track_variable_assignment(self, node: ast.AST, queryset_name: str):
        if queryset_name:
            print("Is variable assigned to optimized queryset?", queryset_name)
            if self.global_context.is_queryset_optimized(node):
                print("Tracking variable assignment for optimized queryset:", node, queryset_name)
                if isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            print(f"Tracking variable assignment for optimized queryset: {target.id}")
                            self.global_context.add_optimized_variable(target, node)
            else:
                print("Queryset is not optimized", queryset_name)

    def is_queryset_or_variable_optimized(self, node: ast.AST) -> bool:
        if self.global_context.is_variable_optimized(node):
            print(f"Loop variable is optimized: {node}")
            return True
        print("Checking if queryset NODE is optimized:", ast.dump(node, annotate_fields=True))
        if isinstance(node, ast.Attribute):
            print("Node is an attribute", node.value.id)
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
            print(f"Getting queryset name (attribute): {node.func}")
            return self.get_full_attribute_chain(node.func)
        
        # Handle the case when the node is a simple variable (e.g., User.objects.all())
        elif isinstance(node.func, ast.Name):
            print(f"Getting queryset name (name): {node.func.id}")
            return node.func.id
        
        return ''

    def add_issue(self, loop: ast.AST, node: ast.AST, attr_chain: str):
        issue = {
            'line': loop.lineno,
            'col': loop.col_offset,
            'message': f"Potential N+1 query detected at line {node.lineno}: {attr_chain}",
            'suggestion': "Consider using select_related() or prefetch_related() to optimize this query."
        }
        print(f"Adding issue: {issue}")
        self.issues.append(issue)