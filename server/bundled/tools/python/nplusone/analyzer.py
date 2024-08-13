import ast
import uuid
from typing import Dict, List, Set, Any

from constants import QUERY_METHODS, OPTIMIZATION_METHODS, WRITE_METHODS, BULK_METHODS
from log import LOGGER

class NPlusOneAnalyzer:
    def __init__(self, source_code: str, model_cache: Dict[str, Any]):
        self.nplusone_issues = []
        self.source_code = source_code
        self.model_cache = model_cache
        self.optimized_fields: Dict[str, Set[str]] = {}

    def get_issues(self):
        return self.nplusone_issues
    
    @staticmethod
    def run_pluralize_singularize(word: str) -> List[str]:
        """
        Returns a list containing the original word, a simple plural form, and a simple singular form.
        This is a basic implementation and doesn't cover all English pluralization rules.
        """
        if word.endswith('s'):
            # If it ends with 's', assume it's plural and create a singular by removing 's'
            return [word, word, word[:-1]]
        else:
            # If it doesn't end with 's', assume it's singular and create a plural by adding 's'
            return [word, word + 's', word]

    def analyze_function(self, node: ast.FunctionDef):
        LOGGER.error(f"Analyzing function: {node.name}")
        self.optimized_fields = {}
        parent_queryset = self.find_parent_queryset(node)
        if parent_queryset:
            self.update_optimized_fields(parent_queryset)
        
        LOGGER.error(f"Optimized fields: {self.optimized_fields}")
        
        loops = self.find_loops(node)
        for loop in loops:
            LOGGER.error(f"Found loop at line {loop.lineno}")
            query_calls = [call for call in self.find_query_calls(loop) if self.is_potential_n_plus_one(call)]
            write_calls = [call for call in self.find_query_calls(loop) if self.is_repetitive_write(call)]
            
            LOGGER.error(f"Found {len(query_calls)} potential N+1 query calls in loop")
            LOGGER.error(f"Found {len(write_calls)} repetitive write operations in loop")
            
            if query_calls:
                unique_queries = self.deduplicate_queries(query_calls, loop)
                for call in unique_queries:
                    LOGGER.error(f"Checking query call at line {call.lineno}")
                    if not self.is_optimized(call):
                        LOGGER.error(f"Adding N+1 issue for query call at line {call.lineno}")
                        self.add_issue(node, loop, call, is_n_plus_one=True)
                    else:
                        LOGGER.error(f"Query call at line {call.lineno} is optimized")
            
            if write_calls:
                for call in write_calls:
                    LOGGER.error(f"Adding repetitive write issue for call at line {call.lineno}")
                    self.add_issue(node, loop, call, is_n_plus_one=False)

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

    def add_issue(self, func_node: ast.FunctionDef, loop_node: ast.AST, call_node: ast.AST, is_n_plus_one: bool):
        """
        Add a new N+1 query issue to the list of issues, with enhanced contextual information.
        """
        LOGGER.debug(f"Adding N+1 issue in function {func_node.name} at line {call_node.lineno}")
        source_segment = ast.get_source_segment(self.source_code, call_node)
        related_field = self.extract_related_field(call_node)
        is_related_field_access = (
            self.is_related_field_access(call_node, func_node, is_read=True)
            if isinstance(call_node, ast.Attribute) else False
        )
        query_type = self.get_query_type(call_node)
        is_bulk_operation = self.is_bulk_operation(call_node)
        issue_message = self.create_issue_message(source_segment, query_type, related_field, is_related_field_access, is_bulk_operation)
        issue_type = "N+1 Query" if is_n_plus_one else "Repetitive Write Operation"

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
                'is_related_field_access': is_related_field_access,
                'is_bulk_operation': is_bulk_operation,
            },
            'start_line': getattr(loop_node, 'lineno', call_node.lineno),
            'end_line': call_node.lineno,
            'issue_type': issue_type
        }
        self.nplusone_issues.append(issue_detail)
    
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
            if node.func.attr in QUERY_METHODS:
                LOGGER.error(f"Found 'read' query method: {node.func.attr}")
                return "read"
            elif node.func.attr in WRITE_METHODS:
                LOGGER.error(f"Found 'write' query method: {node.func.attr}")
                return "write"
        elif isinstance(node, ast.Attribute):
            if self.is_related_field_access(node):
                LOGGER.error(f"Found related field access: {node.attr}")
                return "attribute_access"
        LOGGER.error(f"Found 'unknown' operation: {getattr(node, 'attr', str(node))}")
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
        LOGGER.debug(f"Searching for parent queryset in function {node.name}")
        for statement in node.body:
            if isinstance(statement, ast.Assign):
                value = statement.value
            elif isinstance(statement, ast.Expr):
                value = statement.value
            else:
                continue
            
            if self.check_node_for_optimization(value):
                LOGGER.debug(f"Found parent queryset with optimization")
                return value
        LOGGER.debug("No parent queryset found")
        return None
    
    def find_query_calls(self, node: ast.AST):
        query_calls = [
            ast_node for ast_node in ast.walk(node) 
            if (self.is_query_call(ast_node) or self.is_repetitive_write(ast_node)) and not self.is_optimized_filter_query(ast_node)
        ]
        LOGGER.debug(f"Found {len(query_calls)} query and write calls")
        return query_calls
    
    def update_optimized_fields(self, node: ast.AST):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute) and node.func.attr in OPTIMIZATION_METHODS:
                base_model = self.get_base_model(node.func.value)
                for arg in node.args:
                    if isinstance(arg, ast.Str):
                        self.add_optimized_field(base_model, arg.s)
                for keyword in node.keywords:
                    if isinstance(keyword.value, ast.Str):
                        self.add_optimized_field(base_model, keyword.value.s)
            self.update_optimized_fields(node.func)
        elif isinstance(node, ast.Attribute):
            self.update_optimized_fields(node.value)

    def add_optimized_field(self, base_model: str, field_path: str):
        parts = field_path.split('__')
        current_model = base_model
        for index, part in enumerate(parts):
            if current_model not in self.optimized_fields:
                self.optimized_fields[current_model] = set()
            self.optimized_fields[current_model].add(part)
            if index < len(parts) - 1:
                self.optimized_fields[current_model].add('__'.join(parts[index:]))
            current_model = part
        LOGGER.debug(f"Added optimized field: {base_model}.{field_path}")
        LOGGER.debug(f"Updated optimized fields: {self.optimized_fields}")

    def get_base_model(self, node: ast.AST) -> str:
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return self.get_base_model(node.value)
        return ""
    
    def check_node_for_optimization(self, node: ast.AST) -> bool:
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute) and node.func.attr in OPTIMIZATION_METHODS:
                self.update_optimized_fields(node)
                return True
            return self.check_node_for_optimization(node.func)
        elif isinstance(node, ast.Attribute):
            return self.check_node_for_optimization(node.value)
        return False
    
    def is_query_call(self, node: ast.AST) -> bool:
        if isinstance(node, ast.Call):
            if self.is_optimized_filter_query(node):
                return False
            if isinstance(node.func, ast.Attribute):
                if node.func.attr in QUERY_METHODS or node.func.attr in WRITE_METHODS:
                    LOGGER.error(f"Identified query or write call: {node.func.attr}")
                    return True
            elif isinstance(node.func, ast.Name):
                if node.func.id in QUERY_METHODS or node.func.id in WRITE_METHODS:
                    LOGGER.error(f"Identified query or write call: {node.func.id}")
                    return True
        elif isinstance(node, ast.Attribute):
            if self.is_related_field_access(node, is_read=True) or node.attr in WRITE_METHODS:
                LOGGER.error(f"Identified related field access or write method: {node.attr}")
                return True
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
            
            if isinstance(current, ast.Attribute) and current.attr in QUERY_METHODS:
                return True

        # Consider it a potential N+1 query if there are at least two levels
        return levels >= 2

    def is_optimized(self, call_node: ast.AST) -> bool:
        LOGGER.debug(f"Checking optimization for call at line {getattr(call_node, 'lineno', 'unknown')}")
        
        if isinstance(call_node, ast.Call):
            if isinstance(call_node.func, ast.Attribute):
                base_model = self.get_base_model(call_node.func.value)
                field = call_node.func.attr
        elif isinstance(call_node, ast.Attribute):
            base_model = self.get_base_model(call_node.value)
            field = call_node.attr
        else:
            LOGGER.debug("Unexpected node type for optimization check")
            return False

        LOGGER.debug(f"Checking optimization for {base_model}.{field}")
        LOGGER.debug(f"Optimized fields: {self.optimized_fields}")

        def is_field_optimized(model, field_to_check):
            if model in self.optimized_fields:
                field_variations = self.run_pluralize_singularize(field_to_check)
                LOGGER.debug(f"Checking field variations for {field_to_check}: {field_variations}")
                for field_var in field_variations:
                    # Check for direct optimization
                    if field_var in self.optimized_fields[model]:
                        return True
                    
                    # Check for nested optimization
                    for opt_field in self.optimized_fields[model]:
                        if '__' in opt_field:
                            parts = opt_field.split('__')
                            if parts[0] == field_var:
                                return True
                            if len(parts) > 1 and '__'.join(parts[:2]) == field_var:
                                return True
            return False

        # Check if the field is optimized for the base model
        if is_field_optimized(base_model, field):
            LOGGER.debug(f"Field {field} is optimized for model {base_model}")
            return True

        # Check if it's a reverse relation
        for model in self.optimized_fields:
            if is_field_optimized(model, base_model):
                LOGGER.debug(f"Reverse relation found: {model} -> {base_model}")
                return True

        LOGGER.debug(f"No optimization found for {base_model}.{field}")
        return False
    
    def is_related_field_access(self, node: ast.Attribute, parent_node: ast.AST = None, is_read: bool = True) -> bool:
        if parent_node and isinstance(parent_node, ast.Assign):
            if node in parent_node.targets:
                if is_read:
                    return False
            elif node in ast.walk(parent_node.value):
                return False
        
        levels = []
        current = node
        while isinstance(current, ast.Attribute):
            levels.append(current.attr)
            current = current.value
        if isinstance(current, ast.Name):
            levels.append(current.id)
        
        levels.reverse()
        field_access = '.'.join(levels)
        
        LOGGER.info(f"Checking field access: {field_access}")
        
        # Consider it a direct attribute access if it's only two levels deep (e.g., "model.field")
        if len(levels) == 2:
            LOGGER.debug(f"Field access '{field_access}' is likely a direct attribute")
            return False
        
        # Consider it a potential N+1 query if it's more than two levels deep (e.g., "model.related.field")
        if len(levels) > 2:
            LOGGER.debug(f"Field access '{field_access}' is a potential related field access")
            # Check if it's optimized
            if self.is_optimized(node):
                LOGGER.debug(f"Related field access '{field_access}' is optimized")
                return False
            else:
                LOGGER.debug(f"Related field access '{field_access}' is not optimized")
                return True
        
        # If it's a method call that could trigger a query, consider it a potential N+1 query (e.g., "model.related.filter()")
        if isinstance(node.ctx, ast.Load) and isinstance(parent_node, ast.Call):
            LOGGER.debug(f"Field access '{field_access}' is a method call, potential N+1 query")
            return True
        
        return False

    def is_potential_n_plus_one(self, node: ast.AST) -> bool:
        if isinstance(node, ast.Call):
            if self.is_optimized_filter_query(node):
                return False
            if isinstance(node.func, ast.Attribute):
                return node.func.attr in QUERY_METHODS
            elif isinstance(node.func, ast.Name):
                return node.func.id in QUERY_METHODS
        elif isinstance(node, ast.Attribute):
            return self.is_related_field_access(node, is_read=True)
        return False
    
    def is_repetitive_write(self, node: ast.AST) -> bool:
        """
        Determines if an operation is a repetitive write operation which can be inefficient.
        """
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                return node.func.attr in WRITE_METHODS
            elif isinstance(node.func, ast.Name):
                return node.func.id in WRITE_METHODS
        elif isinstance(node, ast.Attribute):
            return node.attr in WRITE_METHODS
        return False
    
    def is_optimized_filter_query(self, node: ast.AST) -> bool:
        is_optimized = False
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                if node.func.attr in ['last', 'first']:
                    # Check if this is chained to a filter call
                    if isinstance(node.func.value, ast.Call) and isinstance(node.func.value.func, ast.Attribute):
                        is_optimized = node.func.value.func.attr == 'filter'
        elif isinstance(node, ast.Attribute):
            if node.attr in ['last', 'first']:
                # Check if this is chained to a filter call
                if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute):
                    is_optimized = node.value.func.attr == 'filter'
        LOGGER.debug(f"Checked for optimized filter query: {is_optimized}")
        return is_optimized
    
    def is_bulk_operation(self, node: ast.AST) -> bool:
        """
        Determines if an operation is a bulk operation.
        """
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                return node.func.attr in BULK_METHODS
            elif isinstance(node.func, ast.Name):
                return node.func.id in BULK_METHODS
        return False