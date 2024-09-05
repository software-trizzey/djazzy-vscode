import ast
import sys
import http.client
import json
from urllib.parse import urlparse

from log import LOGGER


class NPlusOneQueryService:
    def __init__(self, source_code: str, model_cache: dict, connection_info: dict):
        self.source_code = source_code
        self.model_cache = model_cache
        self.user_api_key = connection_info.get("user_api_key")
        self.api_server_url = connection_info.get("server_url")
        self.tree = None

    def analyze(self):
        """
        Analyze the source code for N+1 query issues by identifying loops and querysets,
        and sending the extracted context to an external LLM API for analysis.
        """
        LOGGER.info("Starting N+1 query analysis.")
        try:
            if not self.user_api_key:
                LOGGER.warning("API key is missing. Please provide a valid API key.")
                return None
            elif not self.api_server_url:
                LOGGER.warning("API server URL is missing. Please provide a valid server URL.")
                return None

            self.tree = ast.parse(self.source_code)

            querysets = self.extract_querysets()
            loops = self.extract_loops()

            if not querysets or not loops:
                LOGGER.warning("No querysets or loops found for N+1 query analysis.")
                return None

            payload = {
                "functionCode": self.source_code,
                "modelDefinitions": self.model_cache,
                "querysetDefinitions": querysets,
                "loopDefinitions": loops,
                "optimizationMethods": "", # TODO: track optimization methods?
                "apiKey": self.user_api_key
            }

            response = self._send_post_request(self.api_server_url, payload)

            if response['status'] == 200:
                analysis_results = json.loads(response['data'])
                LOGGER.info("N+1 query analysis complete.")
                return analysis_results
            else:
                LOGGER.warning(f"Failed to analyze N+1 queries. Status: {response['status']} - {response['data']}")
                return None
        except SyntaxError as syntax_error:
            LOGGER.warning(f"Syntax error in the provided source code: {syntax_error}")
            return None
        except Exception as general_error:
            LOGGER.warning(f"Error during N+1 query detection: {general_error}")
            return None

    def _send_post_request(self, url, payload):
        """
        Helper method to send POST request using http.client
        """
        try:
            parsed_url = urlparse(url)
            connection = http.client.HTTPConnection(parsed_url.hostname, parsed_url.port)
            headers = {'Content-type': 'application/json'}

            connection.request("POST", parsed_url.path, body=json.dumps(payload), headers=headers)
            response = connection.getresponse()
            data = response.read().decode()

            return {
                'status': response.status,
                'data': data
            }
        except Exception as e:
            LOGGER.warning(f"Error sending POST request: {e}")
            return {
                'status': 500,
                'data': str(e)
            }

    def extract_querysets(self):
        """
        Extracts Django querysets from the code with location data.
        Identifies relevant querysets (e.g., `User.objects.all()`, etc.).
        """
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
                LOGGER.debug(f"Found queryset: {query} at {location}")
        return querysets

    def extract_loops(self):
        """
        Extracts loops from the source code with location data.
        Identifies loops that could be associated with the detected querysets.
        """
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
                LOGGER.debug(f"Found loop: {loop_source} at {location}")
        return loops


def main():
    if len(sys.argv) < 4:
        print("Usage: python detect_nplusone.py <source_code> <model_cache_json> <connection_info_json>", file=sys.stderr)
        sys.exit(1)

    source_code = sys.argv[1]
    model_cache_json = sys.argv[2]
    connection_info_json = sys.argv[3]

    try:
        connection_info = json.loads(connection_info_json)
    except json.JSONDecodeError as e:
        print(f"Error parsing connection_info JSON: {e}", file=sys.stderr)
        sys.exit(1)

    nplus_one_service = NPlusOneQueryService(source_code, model_cache_json, connection_info)
    diagnositcs = nplus_one_service.analyze()

    print(json.dumps(diagnositcs))

if __name__ == "__main__":
    main()
