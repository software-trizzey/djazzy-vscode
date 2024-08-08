import logging

logging.basicConfig(
    filename='django_analyzer.log',
    level=logging.DEBUG, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

LOGGER = logging.getLogger(__name__)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
LOGGER.addHandler(console_handler)