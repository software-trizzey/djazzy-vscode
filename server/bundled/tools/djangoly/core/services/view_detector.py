import ast
from typing import Set, Dict, Optional

from djangoly.core.utils.log import LOGGER

MAX_DEPTH = 5

class DjangoViewType:
    CLASS_VIEW = 'django_class_view'
    FUNCTIONAL_VIEW = 'django_func_view'

class DjangoViewDetectionService:
    DJANGO_VIEW_BASES = {
        'View', 'TemplateView', 'ListView', 'DetailView', 'CreateView', 'UpdateView', 'DeleteView',
        'FormView', 'RedirectView', 'APIView', 'GenericAPIView', 'ViewSet', 'ModelViewSet',
        'ReadOnlyModelViewSet'
    }
    
    DJANGO_VIEW_MIXINS = {
        'LoginRequiredMixin', 'PermissionRequiredMixin', 'UserPassesTestMixin', 'AccessMixin',
        'ContextMixin', 'SingleObjectMixin', 'MultipleObjectMixin', 'TemplateResponseMixin'
    }

    def __init__(self):
        self.django_imports: Set[str] = set()
        self.class_type_cache: Dict[str, Optional[str]] = {}
        LOGGER.debug("DjangoViewDetectionService initialized")

    def initialize(self, tree: Optional[ast.AST]):
        if tree:
            LOGGER.debug("Initializing DjangoViewDetectionService with AST")
            self.django_imports = self._extract_django_imports(tree)
        else:
            LOGGER.warning("Initializing DjangoViewDetectionService without AST")
            self.django_imports = set()
        self.class_type_cache.clear()
        LOGGER.debug(f"Django imports extracted: {self.django_imports}")

    def _extract_django_imports(self, tree: ast.AST) -> Set[str]:
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module and 'django' in node.module:
                for alias in node.names:
                    imports.add(alias.name)
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if 'django' in alias.name:
                        imports.add(alias.name.split('.')[-1])
        LOGGER.debug(f"Extracted Django imports: {imports}")
        return imports

    def _is_django_view_base(self, class_name: str) -> bool:
        result = class_name in self.DJANGO_VIEW_BASES or class_name in self.DJANGO_VIEW_MIXINS
        LOGGER.debug(f"Checking if {class_name} is a Django view base: {result}")
        return result

    def is_django_view_class(self, node: ast.ClassDef) -> bool:
        LOGGER.debug(f"Checking if class {node.name} is a Django view class")
        for base in node.bases:
            if isinstance(base, ast.Name):
                if self._is_django_view_base(base.id) or base.id in self.django_imports:
                    LOGGER.debug(f"Class {node.name} is a Django view class (base: {base.id})")
                    return True
            elif isinstance(base, ast.Attribute):
                if self._is_django_view_base(base.attr):
                    LOGGER.debug(f"Class {node.name} is a Django view class (base: {base.attr})")
                    return True
        LOGGER.debug(f"Class {node.name} is not a Django view class")
        return False

    def is_django_view_function(self, node: ast.FunctionDef) -> bool:
        result = any(decorator.id in {'view', 'api_view'} for decorator in node.decorator_list if isinstance(decorator, ast.Name)) or node.name.endswith('_view')
        LOGGER.debug(f"Checking if function {node.name} is a Django view function: {result}")
        return result

    def get_django_class_type(self, node: ast.ClassDef, class_definitions: Dict[str, ast.ClassDef]) -> Optional[str]:
        LOGGER.debug(f"Getting Django class type for {node.name}")
        if node.name in self.class_type_cache:
            LOGGER.debug(f"Class type for {node.name} found in cache: {self.class_type_cache[node.name]}")
            return self.class_type_cache[node.name]

        to_check = [(node, 0)]
        checked = set()

        while to_check:
            current_node, depth = to_check.pop(0)
            LOGGER.debug(f"Checking class {current_node.name} at depth {depth}")

            if depth > MAX_DEPTH:
                LOGGER.warning(f"Max recursion depth reached for class {current_node.name} at depth {depth}")
                continue  # Stop processing this branch

            if current_node.name in checked:
                LOGGER.debug(f"Class {current_node.name} already checked")
                continue

            checked.add(current_node.name)

            if self.is_django_view_class(current_node):
                self.class_type_cache[node.name] = DjangoViewType.CLASS_VIEW
                LOGGER.debug(f"Class {node.name} identified as Django view")
                return DjangoViewType.CLASS_VIEW

            # Check if it's a direct subclass of models.Model
            for base in current_node.bases:
                if isinstance(base, ast.Attribute) and base.attr == 'Model' and isinstance(base.value, ast.Name) and base.value.id == 'models':
                    self.class_type_cache[node.name] = 'django_model'
                    LOGGER.debug(f"Class {node.name} identified as Django model")
                    return 'django_model'

            # Add parent classes to the queue
            for base in current_node.bases:
                if isinstance(base, ast.Name):
                    if base.id in class_definitions:
                        LOGGER.debug(f"Adding parent class {base.id} to check queue for {current_node.name}")
                        to_check.append((class_definitions[base.id], depth + 1))

        self.class_type_cache[node.name] = None
        LOGGER.debug(f"Class {node.name} is not a Django view or model")
        return None
