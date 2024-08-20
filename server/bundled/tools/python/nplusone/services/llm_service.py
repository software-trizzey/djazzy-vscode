import json
from urllib import request, error
from urllib.parse import urljoin

from enum import Enum
from typing import Dict, Union, Any

from log import LOGGER


class Models(Enum):
    GROQ = "groq"
    OPEN_AI = "openai"

class ForbiddenError(Exception):
    pass

class RateLimitError(Exception):
    pass

class LLMService:
    def __init__(self, api_server_json: Dict[str, Any]):
        self.api_server_url = api_server_json["api_server_url"]
        self.user_token = api_server_json["user_token"]
        LOGGER.info(f"Initialized LLM service with API server URL {self.api_server_url}")

    def validate_optimization(self, context: Dict[str, Any]) -> bool:
        try:
            developer_input = {
                "functionBody": context.get("function_body", ""),
                "modelInfo": context.get("model_info", {}),
                "optimizedQuerysets": context.get("optimized_querysets", {}),
                "baseModel": context.get("base_model", ""),
                "field": context.get("field", ""),
                "queryType": context.get("query_type", ""),
            }
            LOGGER.debug(f"Validating optimization with developer input: {developer_input}")

            response = self.chat_with_llm(
                system_message="You are an AI assistant analyzing Django queries for N+1 problems.",
                developer_input=developer_input,
                model_id=Models.GROQ
            )

            if isinstance(response, dict) and 'error' in response:
                LOGGER.error(f"Error in LLM response: {response['error']}")
                return False

            if 'issues' in response:
                return len(response['issues']) == 0
            else:
                LOGGER.warning(f"Unexpected response format from LLM: {response}")
                return False

        except json.JSONDecodeError as e:
            LOGGER.error(f"Error decoding JSON response: {str(e)}")
            return False
        except error.URLError as e:
            LOGGER.error(f"Error making request to LLM service: {str(e)}")
            return False
        except Exception as e:
            LOGGER.error(f"Unexpected error in validate_optimization: {str(e)}")
            return False

    def verify_queryset_optimization(self, context: Dict[str, Any]) -> Dict[str, Any]:
        try:
            developer_input = {
                "queryset": context.get("queryset", ""),
                "model": context.get("model", ""),
                "field": context.get("field", ""),
                "context": context.get("additional_context", ""),
            }

            response = self._send_chat_request(
                '/chat/verify_queryset_optimization/',
                "You are an AI assistant analyzing Django querysets for optimization.",
                developer_input
            )
            LOGGER.debug(f"LLM Response: {response}")

            if isinstance(response, dict) and 'error' in response:
                LOGGER.error(f"Error in LLM response: {response['error']}")
                return {'is_optimized': False, 'explanation': f"Error: {response['error']}"}

            return response

        except json.JSONDecodeError as e:
            LOGGER.error(f"Error decoding JSON response: {str(e)}")
            return {'is_optimized': False, 'explanation': "Error decoding response"}
        except error.URLError as e:
            LOGGER.error(f"Error making request to LLM service: {str(e)}")
            return {'is_optimized': False, 'explanation': "Error communicating with service"}
        except Exception as e:
            LOGGER.error(f"Unexpected error in verify_queryset_optimization: {str(e)}")
            return {'is_optimized': False, 'explanation': "An unexpected error occurred"}

    def _handle_error_response(self, http_error: error.HTTPError) -> None:
        error_message = f"Error: {http_error.reason}"
        error_data = None
        try:
            error_data = json.loads(http_error.read().decode())
            if 'error' in error_data:
                error_message = f"Error: {error_data['error']}"
        except json.JSONDecodeError:
            LOGGER.error('Error parsing JSON error response')

        if http_error.code == 400:
            error_message = 'Invalid input. Please check your input and try again.'
        elif http_error.code == 401:
            error_message = 'Unauthorized request. Please log in again.'
        elif http_error.code == 403:
            raise ForbiddenError('You do not have permission to perform this action.')
        elif http_error.code == 429:
            raise RateLimitError('Daily request limit exceeded. Please try again tomorrow.')
        elif http_error.code == 500:
            error_message = 'Internal server error. Please try again later.'
        else:
            error_message = f"Unexpected error: {http_error.reason}"

        LOGGER.error(f"HTTP error {http_error.code}: {error_message}")
        raise Exception(error_message)

    def _send_chat_request(
        self,
        endpoint: str,
        system_message: str,
        developer_input: Dict[str, Any]
    ) -> Any:
        try:
            url = urljoin(self.api_server_url, endpoint)
            data = json.dumps({
                "systemMessage": system_message,
                "developerInput": developer_input,
                "apiKey": self.user_token
            }).encode('utf-8')
            
            headers = {
                "Content-Type": "application/json"
            }
            
            req = request.Request(url, data=data, headers=headers, method='POST')
            
            with request.urlopen(req) as response:
                response_data = response.read().decode('utf-8')
                return json.loads(response_data)
                
        except error.HTTPError as e:
            self._handle_error_response(e)
        except error.URLError as e:
            LOGGER.error(f"URL error occurred: {e.reason}")
            return {'error': f"URL error: {e.reason}"}
        except Exception as e:
            LOGGER.error(f"An unexpected error occurred: {str(e)}")
            return {'error': f"Unexpected error: {str(e)}"}

    def chat_with_groq(self, system_message: str, developer_input: Union[Dict, str]) -> Any:
        return self._send_chat_request('/chat/groq/', system_message, developer_input)

    def chat_with_openai(self, system_message: str, developer_input: Union[Dict, str]) -> Any:
        return self._send_chat_request('/chat/openai/', system_message, developer_input)

    def chat_with_llm(self, system_message: str, developer_input: Dict, model_id: Models = Models.GROQ) -> Any:
        try:
            if model_id == Models.GROQ:
                response = self.chat_with_groq(system_message, developer_input)
            elif model_id == Models.OPEN_AI:
                response = self.chat_with_openai(system_message, developer_input)
            else:
                raise ValueError("Invalid model specified")

            return response
        except RateLimitError:
            LOGGER.warning(f"Rate limit exceeded for user {self.user_token}")
            raise
        except Exception as error:
            LOGGER.error(f"Error in chat_with_llm: {str(error)}")
            raise