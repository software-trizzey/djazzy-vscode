import ast
import astroid

from log import LOGGER


MODEL_NAME_CHAIN = 'django.db.models.base.Model'

def is_django_model_class(node):
    """
    Determines if a node is a Django model class by using astroid to infer types.
    """
    if not isinstance(node, astroid.ClassDef):
        return False

    try:
        for base in node.bases:
            inferred_bases = base.infer()
            for inferred in inferred_bases:
                # Check if the class is a subclass of 'django.db.models.Model'
                if isinstance(inferred, astroid.ClassDef) and inferred.qname() == MODEL_NAME_CHAIN:
                    LOGGER.debug(f"Found subclass of django.db.models.Model: {node.name}")
                    return True
    except astroid.InferenceError as e:
        LOGGER.warning(f"Error inferring base class for {node.name}: {e}")

    LOGGER.debug(f"Class {node.name} is not a Django model")
    return False


def serialize_file_data(obj):
    if isinstance(obj, ast.AST):
        return {k: serialize_file_data(v) for k, v in ast.iter_fields(obj)}
    elif isinstance(obj, list):
        return [serialize_file_data(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: serialize_file_data(v) for k, v in obj.items()}
    else:
        return str(obj)
    
