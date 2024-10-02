try:
    from importlib.metadata import version, PackageNotFoundError
except ImportError:  # For Python < 3.8 compatibility
    from importlib_metadata import version, PackageNotFoundError

try:
    __version__ = version("djangoly")
except PackageNotFoundError:
    __version__ = "unknown"
