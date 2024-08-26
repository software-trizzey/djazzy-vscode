import ast

from typing import Optional

from log import LOGGER


def get_model_info(model_name: str, model_cache: dict) -> Optional[dict]:
    """
    Retrieves model information from the model cache.
    Args:
        model_name (str): The name of the model class to retrieve information for.
        model_cache (dict): A dictionary containing model information for all models in the project.

    Returns:
        Optional[dict]: A dictionary containing fields, relationships, and parent models,
                        or None if the model is not found.
    """
    model_info = model_cache.get(model_name)
    if model_info:
        LOGGER.debug(f"Found model info for {model_name}: {model_info}")
        return model_info
    else:
        LOGGER.debug(f"Model info for {model_name} not found in cache")
        return None


def is_django_model_class(node, class_definitions, model_cache):
    if not isinstance(node, ast.ClassDef):
        return False

    for base in node.bases:
        # Direct check for 'models.Model'
        if isinstance(base, ast.Attribute) and base.attr == 'Model' and base.value.id == 'models':
            LOGGER.debug(f"Found direct subclass of models.Model for {node.name}")
            return True

        # Recursively check each parent class in the chain
        if isinstance(base, ast.Name) and base.id in class_definitions:
            parent_class = class_definitions[base.id]
            LOGGER.debug(f"Checking parent class {base.id} for {node.name}")
            if is_django_model_class(parent_class, class_definitions, model_cache):
                LOGGER.debug(f"Model {node.name} is a django model with a parent of {base.id}")
                return True

        if isinstance(base, ast.Name):
            LOGGER.debug(f"Checking parent models for {base.id}")
            parent_model_info = get_model_info(base.id, model_cache)  # Fetch cached model info
            if parent_model_info:
                LOGGER.debug(f"Parent model info for {base.id}: {parent_model_info}")
                # Recursively check if any of the parent models are Django models
                for parent_model in parent_model_info['parent_models']:
                    LOGGER.debug(f"Checking if {parent_model} is a Django model for {node.name}")
                    if parent_model == 'models.Model':
                        LOGGER.debug(f"Model {node.name} is a django model because its parent is models.Model")
                        return True
                    if parent_model in class_definitions:
                        parent_class = class_definitions[parent_model]
                        if is_django_model_class(parent_class, class_definitions, model_cache):
                            LOGGER.debug(f"Model {node.name} is a django model with a parent of {parent_model}")
                            return True
    LOGGER.debug(f"Model {node.name} is not a django model")
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
    
