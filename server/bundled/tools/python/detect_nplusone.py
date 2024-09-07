import ast
import json
import sys

class NPlusOneQueryService:
    def __init__(self, source_code: str, model_cache: dict):
        self.source_code = source_code
        self.model_cache = model_cache
        self.tree = None

    def analyze(self):
        self.tree = ast.parse(self.source_code)
        querysets = self.extract_querysets()
        loops = self.extract_loops()

        return {
            "functionCode": self.source_code,
            "modelDefinitions": self.model_cache,
            "querysetDefinitions": querysets,
            "loopDefinitions": loops
        }

    def extract_querysets(self):
        querysets = []
        for node in ast.walk(self.tree):
            if isinstance(node, ast.Call) and hasattr(node.func, 'attr') and node.func.attr in ['filter', 'all', 'get']:
                query = ast.get_source_segment(self.source_code, node)
                location = {
                    'line': node.lineno,
                    'column': node.col_offset,
                    'end_line': node.end_lineno,
                    'end_column': node.end_col_offset
                }
                querysets.append({
                    'query': query,
                    'location': location
                })
        return querysets

    def extract_loops(self):
        loops = []
        for node in ast.walk(self.tree):
            if isinstance(node, ast.For):
                loop_source = ast.get_source_segment(self.source_code, node)
                location = {
                    'line': node.lineno,
                    'column': node.col_offset,
                    'end_line': node.end_lineno,
                    'end_column': node.end_col_offset
                }
                loops.append({
                    'loop': loop_source,
                    'location': location
                })
        return loops


def main():
    if len(sys.argv) < 3:
        print("Usage: python detect_nplusone.py <source_code> <model_cache_json>", file=sys.stderr)
        sys.exit(1)

    source_code = sys.argv[1]
    model_cache_json = sys.argv[2]
    model_cache = json.loads(model_cache_json)

    nplus_one_service = NPlusOneQueryService(source_code, model_cache)
    analysis_data = nplus_one_service.analyze()

    print(json.dumps(analysis_data))


if __name__ == "__main__":
    main()
