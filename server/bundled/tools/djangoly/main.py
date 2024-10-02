import argparse

from .core.commands.check import check_command
from .__version__ import __version__


def main():
    """
    Entry point for Djangoly.
    """
    parser = argparse.ArgumentParser(
        prog='djangoly',
        description='Welcome to Djangoly! Your Django Best Practices Companion'
    )
    subparsers = parser.add_subparsers(title='Commands', dest='command')
    subparsers.required = True

    # 'check' command
    check_parser = subparsers.add_parser('check', help='Analyze Django files for issues')
    check_parser.add_argument('file', nargs='?', type=str, help='Path to the Django file or directory to analyze')
    check_parser.set_defaults(func=check_command)

    # 'version' command
    version_parser = subparsers.add_parser('version', help='Show Djangoly version')
    version_parser.set_defaults(func=show_version)

    args = parser.parse_args()
    args.func(args)


def show_version(args):
    """
    Command to show the version of Djangoly.
    """
    print(f"Djangoly {__version__}")


if __name__ == "__main__":
    main()
