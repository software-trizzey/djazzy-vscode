from constants import AGGREGATE_METHODS, IssueSeverity

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
    def calculate_issue_scores(cls, issues):
        return [cls.calculate_issue_score(issue) for issue in issues]

    @classmethod
    def calculate_issue_score(cls, issue):
        score = 0
        contextual_info = issue.get('contextual_info', {})

        if contextual_info.get('is_in_loop', False):
            score += cls.SCORE_WEIGHTS['IN_LOOP']

        query_type = contextual_info.get('query_type', '')
        if query_type == 'read':
            score += cls.SCORE_WEIGHTS['QUERY_METHOD']
        elif query_type == 'write':
            score += cls.SCORE_WEIGHTS['WRITE_METHOD']

        if contextual_info.get('is_related_field_access', False):
            score += cls.SCORE_WEIGHTS['RELATED_FIELD']

        if cls.contains_aggregate_method(issue['message']):
            score += cls.SCORE_WEIGHTS['AGGREGATE_METHOD']

        if contextual_info.get('is_bulk_operation', False):
            score += cls.SCORE_WEIGHTS['BULK_OPERATION']
        
        issue['score'] = min(max(score, 0), cls.MAX_SCORE)
        issue['severity'] = cls.get_severity(issue['score'])
        return issue

    @staticmethod
    def contains_aggregate_method(message):
        return any(method in message for method in AGGREGATE_METHODS)

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