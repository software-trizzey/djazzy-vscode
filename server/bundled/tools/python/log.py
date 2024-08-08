import logging

LOGGER = logging.getLogger(__name__)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
LOGGER.addHandler(console_handler)