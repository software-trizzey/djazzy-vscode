import ast

from typing import Set, Dict

from log import LOGGER

class NPlusOneGlobalContext:
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
        LOGGER.debug(f"Checking if variable is optimized: {var_node.value} {is_optimized}")
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