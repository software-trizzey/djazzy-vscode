import re

from constants import AGGREGATE_METHODS, QUERY_METHODS, WRITE_METHODS, RELATED_FIELD_PATTERNS, IssueSeverity

class NPlusOneScorer:
    MAX_SCORE = 100
    SCORE_THRESHOLDS = {
        'LOW': 30,
        'MEDIUM': 60,
        'HIGH': 90
    }
    SCORE_WEIGHTS = {
        'IN_LOOP': 40,
        'QUERY_METHOD': 30,
        'WRITE_METHOD': 35,
        'RELATED_FIELD': 20,
        'AGGREGATE_METHOD': 10,
        'BULK_OPERATION': -20  # Reduce score for bulk operations as they are generally more efficient
    }

    @classmethod
    def calculate_issue_scores(cls, issues, function_body):
        return [cls.calculate_issue_score(issue, function_body) for issue in issues]

    @classmethod
    def calculate_issue_score(cls, issue, function_body):
        score = 0
        if cls.is_in_loop(issue, function_body):
            score += cls.SCORE_WEIGHTS['IN_LOOP']
        if cls.contains_query_method(issue['message']):
            score += cls.SCORE_WEIGHTS['QUERY_METHOD']
        if cls.contains_write_method(issue['message']):
            score += cls.SCORE_WEIGHTS['WRITE_METHOD']
        if cls.contains_related_field(issue['message']):
            score += cls.SCORE_WEIGHTS['RELATED_FIELD']
        if cls.contains_aggregate_method(issue['message']):
            score += cls.SCORE_WEIGHTS['AGGREGATE_METHOD']
        if cls.is_bulk_operation(issue['message']):
            score += cls.SCORE_WEIGHTS['BULK_OPERATION']
        
        issue['score'] = min(max(score, 0), cls.MAX_SCORE)
        issue['severity'] = cls.get_severity(issue['score'])
        return issue

    @staticmethod
    def is_in_loop(issue, function_body):
        start_line = issue.get('start_line', issue.get('startLine', 0))
        end_line = issue.get('end_line', issue.get('endLine', len(function_body.split('\n'))))
        relevant_code = '\n'.join(function_body.split('\n')[start_line:end_line+1])
        return bool(re.search(r'for\s|while\s', relevant_code))

    @staticmethod
    def contains_query_method(message):
        return any(method in message for method in QUERY_METHODS)

    @staticmethod
    def contains_write_method(message):
        return any(method in message for method in WRITE_METHODS)

    @staticmethod
    def contains_related_field(message):
        return any(re.search(pattern, message) for pattern in RELATED_FIELD_PATTERNS)

    @staticmethod
    def contains_aggregate_method(message):
        return any(method in message for method in AGGREGATE_METHODS)

    @staticmethod
    def is_bulk_operation(message):
        return 'bulk_create' in message or 'bulk_update' in message

    @classmethod
    def get_severity(cls, score):
        if score >= cls.SCORE_THRESHOLDS['HIGH']:
            return IssueSeverity.ERROR
        elif score >= cls.SCORE_THRESHOLDS['MEDIUM']:
            return IssueSeverity.WARNING
        elif score >= cls.SCORE_THRESHOLDS['LOW']:
            return IssueSeverity.INFORMATION
        else:
            return IssueSeverity.INFORMATION