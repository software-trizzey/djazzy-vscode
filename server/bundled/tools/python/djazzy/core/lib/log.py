import sys
import logging

# USE THIS TO LOG TO A FILE
# logging.basicConfig(
# 	level=logging.DEBUG,
# 	filename='django_analyzer.txt',
# 	format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
# )

LOG_LEVEL = logging.INFO

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(LOG_LEVEL)

console_handler = logging.StreamHandler(sys.stderr)
console_handler.setLevel(LOG_LEVEL)

formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)

LOGGER.addHandler(console_handler)