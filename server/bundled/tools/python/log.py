import logging

# logging.basicConfig(
# 	level=logging.DEBUG,
# 	filename='django_analyzer.txt',
# 	format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
# )

LOGGER = logging.getLogger(__name__)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
LOGGER.addHandler(console_handler)