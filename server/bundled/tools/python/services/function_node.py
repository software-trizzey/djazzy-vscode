from services.view_detector import DjangoViewType

class FunctionNodeService:
    @staticmethod
    def get_function_end_position(node, source_code):
        """Determine the end line and column of the function."""
        end_line = node.body[-1].end_lineno if hasattr(node.body[-1], 'end_lineno') else node.body[-1].lineno
        end_col = node.body[-1].end_col_offset if hasattr(node.body[-1], 'end_col_offset') else len(source_code.splitlines()[end_line - 1])
        return end_line, end_col

    @staticmethod
    def get_empty_function_position(start_line, start_col, function_name):
        """Calculate end position for empty functions."""
        end_line = start_line
        end_col = start_col + len(f'def {function_name}():')
        return end_line, end_col

    @staticmethod
    def get_symbol_type(node, in_class, current_django_class_type, view_detection_service):
        """Determine the symbol type based on the context."""
        if in_class and current_django_class_type:
            return f'{current_django_class_type}_method'
        elif view_detection_service.is_django_view_function(node):
            return DjangoViewType.FUNCTIONAL_VIEW
        else:
            return 'function'
