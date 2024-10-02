import re
from djangoly.__version__ import __version__

def test_version():
    # Match against semantic versioning pattern
    assert re.match(r'^\d+\.\d+\.\d+', __version__), f"Unexpected version format: {__version__}"
