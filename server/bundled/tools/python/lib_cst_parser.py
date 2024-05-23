import sys
import subprocess
import os
import venv
import libcst as cst
from libcst.metadata import MetadataWrapper, PositionProvider



def add_to_gitignore(project_root):
    gitignore_path = os.path.join(project_root, '.gitignore')
    venv_entry = '.rome_venv'
    
    if os.path.exists(gitignore_path):
        with open(gitignore_path, 'r') as f:
            gitignore_content = f.read()
        
        if venv_entry not in gitignore_content:
            with open(gitignore_path, 'a') as f:
                f.write(f'\n{venv_entry}\n')
            print(f'Added {venv_entry} to .gitignore')
        else:
            print(f'{venv_entry} already exists in .gitignore')
    else:
        with open(gitignore_path, 'w') as f:
            f.write(f'{venv_entry}\n')
        print(f'Created .gitignore and added {venv_entry}')

def create_venv(venv_path):
    if not os.path.exists(venv_path):
        venv.create(venv_path, with_pip=True)
        print(f'Created virtual environment at {venv_path}')
    else:
        print(f'Virtual environment already exists at {venv_path}')

def install_libcst(venv_path):
    subprocess.check_call([os.path.join(venv_path, 'bin', 'pip'), 'install', 'libcst'])
    print(f'Installed libcst in virtual environment at {venv_path}')

class SymbolVisitor(cst.CSTVisitor):
    METADATA_DEPENDENCIES = (PositionProvider,)

    def __init__(self):
        self.symbols = []

    def visit_FunctionDef(self, node: cst.FunctionDef):
        position = self.get_metadata(PositionProvider, node)
        self.symbols.append({
            'type': 'functiondef',
            'name': node.name.value,
            'line': position.start.line - 1,
            'col_offset': position.start.column,
            'end_col_offset': position.end.column,
        })

    def visit_ClassDef(self, node: cst.ClassDef):
        position = self.get_metadata(PositionProvider, node)
        self.symbols.append({
            'type': 'classdef',
            'name': node.name.value,
            'line': position.start.line - 1,
            'col_offset': position.start.column,
            'end_col_offset': position.end.column,
        })

    def visit_Assign(self, node: cst.Assign):
        for target in node.targets:
            if isinstance(target.target, cst.Name):
                position = self.get_metadata(PositionProvider, target)
                self.symbols.append({
                    'type': 'variable',
                    'name': target.target.value,
                    'line': position.start.line - 1,
                    'col_offset': position.start.column,
                    'end_col_offset': position.end.column,
                    'value': cst.Module([]).code_for_node(node.value),
                })

    def visit_Dict(self, node: cst.Dict):
        position = self.get_metadata(PositionProvider, node)
        self.symbols.append({
            'type': 'dictionary',
            'line': position.start.line - 1,
            'col_offset': position.start.column,
            'end_col_offset': position.end.column,
            'value': cst.Module([]).code_for_node(node),
        })

    def visit_List(self, node: cst.List):
        position = self.get_metadata(PositionProvider, node)
        self.symbols.append({
            'type': 'list',
            'line': position.start.line - 1,
            'col_offset': position.start.column,
            'end_col_offset': position.end.column,
            'value': cst.Module([]).code_for_node(node),
        })

def parse_python_code(source_code):
    module = cst.parse_module(source_code)
    wrapper = MetadataWrapper(module)
    visitor = SymbolVisitor()
    wrapper.visit(visitor)
    return visitor.symbols

def run_parser(source_code, venv_path):
    python_executable = os.path.join(venv_path, 'bin', 'python')
    script = """
import libcst as cst
import sys
import json
from libcst.metadata import MetadataWrapper, PositionProvider

class SymbolVisitor(cst.CSTVisitor):
    METADATA_DEPENDENCIES = (PositionProvider,)

    def __init__(self):
        self.symbols = []

    def visit_FunctionDef(self, node: cst.FunctionDef):
        position = self.get_metadata(PositionProvider, node)
        self.symbols.append({
            'type': 'functiondef',
            'name': node.name.value,
            'line': position.start.line - 1,
            'col_offset': position.start.column,
            'end_col_offset': position.end.column,
        })

    def visit_ClassDef(self, node: cst.ClassDef):
        position = self.get_metadata(PositionProvider, node)
        self.symbols.append({
            'type': 'classdef',
            'name': node.name.value,
            'line': position.start.line - 1,
            'col_offset': position.start.column,
            'end_col_offset': position.end.column,
        })

    def visit_Assign(self, node: cst.Assign):
        for target in node.targets:
            if isinstance(target.target, cst.Name):
                position = self.get_metadata(PositionProvider, target)
                self.symbols.append({
                    'type': 'variable',
                    'name': target.target.value,
                    'line': position.start.line - 1,
                    'col_offset': position.start.column,
                    'end_col_offset': position.end.column,
                    'value': cst.Module([]).code_for_node(node.value),
                })

    def visit_Dict(self, node: cst.Dict):
        position = self.get_metadata(PositionProvider, node)
        self.symbols.append({
            'type': 'dictionary',
            'line': position.start.line - 1,
            'col_offset': position.start.column,
            'end_col_offset': position.end.column,
            'value': cst.Module([]).code_for_node(node),
        })

    def visit_List(self, node: cst.List):
        position = self.get_metadata(PositionProvider, node)
        self.symbols.append({
            'type': 'list',
            'line': position.start.line - 1,
            'col_offset': position.start.column,
            'end_col_offset': position.end.column,
            'value': cst.Module([]).code_for_node(node),
        })

def parse_python_code(source_code):
    module = cst.parse_module(source_code)
    wrapper = MetadataWrapper(module)
    visitor = SymbolVisitor()
    wrapper.visit(visitor)
    return visitor.symbols

if __name__ == "__main__":
    try:
        source_code = sys.stdin.read()
        symbols = parse_python_code(source_code)
        print(json.dumps(symbols))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
"""
    process = subprocess.Popen([python_executable, "-c", script], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    output, error = process.communicate(input=source_code.encode())
    return output, error

def main():
    project_root = os.getcwd()
    venv_path = os.path.join(project_root, '.rome_venv')
    
    add_to_gitignore(project_root)
    create_venv(venv_path)
    install_libcst(venv_path)
    
    source_code = sys.stdin.read()
    output, error = run_parser(source_code, venv_path)
    if error:
        sys.stderr.write(error.decode())
        sys.exit(1)
    else:
        sys.stdout.write(output.decode())

if __name__ == "__main__":
    main()
