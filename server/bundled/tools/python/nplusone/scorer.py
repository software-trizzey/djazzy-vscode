from constants import WRITE_METHODS
from issue import IssueSeverity


class NPlusOneScorer:
    MAX_SCORE = 100
    SCORE_THRESHOLDS = {
        'LOW': 40,
        'MEDIUM': 70,
        'HIGH': 95  # reserve this tier for issues that will likely block developer commits
    }
    SCORE_WEIGHTS = {
        'IN_LOOP': 25,
        'QUERY_METHOD': 25,
        'WRITE_METHOD': 30,
        'MULTI_LINE': 10,
    }

    @classmethod
    def calculate_issue_scores(cls, issues):
        return [cls.calculate_issue_score(issue) for issue in issues]

    @classmethod
    def calculate_issue_score(cls, issue):
        score = 0

        score += cls.SCORE_WEIGHTS['IN_LOOP']

        if cls.contains_query_method(issue['problematic_code']):
            score += cls.SCORE_WEIGHTS['QUERY_METHOD']

        if cls.contains_write_method(issue['problematic_code']):
            score += cls.SCORE_WEIGHTS['WRITE_METHOD']

        if issue['end_line'] > issue['start_line']:
            score += cls.SCORE_WEIGHTS['MULTI_LINE']

        score = min(max(score, 0), cls.MAX_SCORE)
        severity = cls.get_severity(score)

        issue['score'] = score
        issue['severity'] = severity

        return issue

    @staticmethod
    def contains_query_method(code):
        return any(method in code for method in ['filter', 'get', 'all'])

    @staticmethod
    def contains_write_method(code):
        return any(method in code for method in WRITE_METHODS)

    @classmethod
    def get_severity(cls, score):
        if score >= cls.SCORE_THRESHOLDS['HIGH']:
            return IssueSeverity.ERROR
        elif score >= cls.SCORE_THRESHOLDS['MEDIUM']:
            return IssueSeverity.WARNING
        elif score >= cls.SCORE_THRESHOLDS['LOW']:
            return IssueSeverity.INFORMATION
        else:
            return IssueSeverity.HINT