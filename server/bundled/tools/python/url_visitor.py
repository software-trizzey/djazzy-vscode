import ast


class DjangoURLPatternVisitor(ast.NodeVisitor):
    """
    TODO: this class is not complete yet. It should be able to visit all the URL patterns in a Django project
    for potential rules.
    """
    def __init__(self):
        self.url_patterns = []

    def visit_Assign(self, node):
        if isinstance(node.targets[0], ast.Name) and node.targets[0].id == 'urlpatterns':
            if isinstance(node.value, ast.List):
                for elt in node.value.elts:
                    if isinstance(elt, ast.Call) and isinstance(elt.func, ast.Name):
                        if elt.func.id in ['path', 're_path', 'url']:
                            pattern = {
                                'type': elt.func.id,
                                'route': None,
                                'view': None,
                                'name': None,
                                'line': elt.lineno,
                                'col': elt.col_offset,
                                'end_line': elt.end_lineno,
                                'end_col': elt.end_col_offset
                            }
                            
                            for currentIndex, arg in enumerate(elt.args):
                                if currentIndex == 0 and isinstance(arg, ast.Constant):
                                    pattern['route'] = arg.value
                                elif currentIndex == 1:
                                    if isinstance(arg, ast.Name):
                                        pattern['view'] = arg.id
                                    elif isinstance(arg, ast.Attribute):
                                        pattern['view'] = f"{arg.value.id}.{arg.attr}"
                            
                            for keyword in elt.keywords:
                                if keyword.arg == 'name' and isinstance(keyword.value, ast.Constant):
                                    pattern['name'] = keyword.value.value
                            
                            self.url_patterns.append(pattern)