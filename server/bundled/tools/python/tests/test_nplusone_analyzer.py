import unittest
import textwrap
from typing import List

from log import LOGGER

from nplusone.nplusone_analyzer import NPlusOneDetector

class TestNPlusOneDetector(unittest.TestCase):

    def setUp(self):
        self.logger = LOGGER
        self.model_cache = {
            'User': {
                'fields': {'username': 'CharField', 'profile': 'ForeignKey'},
                'relationships': {'profile': {'type': 'ForeignKey', 'properties': {'on_delete': 'models.CASCADE'}}},
                'parent_models': ['models.Model']
            },
            'Profile': {
                'fields': {'name': 'CharField'},
                'relationships': {},
                'parent_models': ['models.Model']
            },
            'Order': {
                'fields': {'item': 'ForeignKey'},
                'relationships': {'user': {'type': 'ForeignKey', 'properties': {'related_name': '"orders"', 'on_delete': 'models.CASCADE'}}},
                'parent_models': ['models.Model']
            },
            'Item': {
                'fields': {'name': 'CharField'},
                'relationships': {},
                'parent_models': ['models.Model']
            },
        }

    def assert_n_plus_one_issues(self, source_code: str, expected_issues_count: int, expected_issue_chains: List[str]):
        detector = NPlusOneDetector(source_code, model_cache=self.model_cache)
        issues = detector.analyze()
        self.assertEqual(len(issues), expected_issues_count, f"Expected {expected_issues_count} N+1 issues, but found {len(issues)}")
        found_chains = [issue['message'].split(': ')[-1] for issue in issues]
        self.assertEqual(sorted(found_chains), sorted(expected_issue_chains))

    def test_n_plus_one_detected(self):
        source_code = textwrap.dedent("""
            def get_users():
                users = User.objects.all()
                for user in users:
                    print(user.profile.name)
        """)
        self.assert_n_plus_one_issues(source_code, 1, ['user.profile'])

    def test_no_n_plus_one_with_select_related(self):
        source_code = textwrap.dedent("""
            def get_users():
                users = User.objects.select_related('profile')
                for user in users:
                    print(user.profile.name)
        """)
        self.assert_n_plus_one_issues(source_code, 0, [])

    @unittest.skip("Tracking optimized querysets across functions is not supported yet")
    def test_n_plus_one_across_functions(self):
        source_code = textwrap.dedent("""
            def get_users():
                return User.objects.all()

            def process_users():
                users = get_users()
                for user in users:
                    print(user.profile.name)
        """)
        self.assert_n_plus_one_issues(source_code, 1, ['user.profile'])

    @unittest.skip("Tracking optimized querysets across functions is not supported yet")
    def test_optimized_across_functions(self):
        source_code = textwrap.dedent("""
            def get_users():
                return User.objects.select_related('profile')

            def process_users():
                users = get_users()
                for user in users:
                    print(user.profile.name)
        """)
        self.assert_n_plus_one_issues(source_code, 0, [])

    def test_n_plus_one_with_prefetch_related(self):
        source_code = textwrap.dedent("""
            def get_users():
                users = User.objects.prefetch_related('profile')
                for user in users:
                    print(user.profile.name)
        """)
        self.assert_n_plus_one_issues(source_code, 0, [])

    def test_n_plus_one_in_nested_loops(self):
        source_code = textwrap.dedent("""
            def get_users_and_orders():
                users = User.objects.all()
                for user in users:
                    for order in user.orders.all():
                        print(order.item.name)
        """)
        self.assert_n_plus_one_issues(source_code, 2, ['user.orders', 'order.item'])

    def test_select_related_in_nested_loops(self):
        source_code = textwrap.dedent("""
            def get_users_and_orders():
                users = User.objects.select_related('orders')
                for user in users:
                    for order in user.orders.all():
                        print(order.item.name)
        """)
        self.assert_n_plus_one_issues(source_code, 1, ['order.item'])

    def test_select_related_and_prefetch_related_combined(self):
        source_code = textwrap.dedent("""
            def get_users_and_orders():
                users = User.objects.select_related('profile').prefetch_related('orders')
                for user in users:
                    print(user.profile.name)
                    for order in user.orders.all():
                        print(order.item.name)
        """)
        self.assert_n_plus_one_issues(source_code, 1, ['order.item'])

    def test_no_n_plus_one_with_non_queryset_dict(self):
        source_code = textwrap.dedent("""
            def process_data():
                data = {'key1': 'value1', 'key2': 'value2'}
                for key in data:
                    print(data[key])
        """)
        self.assert_n_plus_one_issues(source_code, 0, [])

    def test_no_n_plus_one_with_non_queryset_list(self):
        source_code = textwrap.dedent("""
            def process_objects():
                objects = [Profile(name='Profile1'), Profile(name='Profile2')]
                for obj in objects:
                    print(obj.name)
        """)
        self.assert_n_plus_one_issues(source_code, 0, [])

    def test_no_n_plus_one_with_single_object(self):
        source_code = textwrap.dedent("""
            def process_single_object():
                obj = Profile(name='Profile1')
                print(obj.name)
        """)
        self.assert_n_plus_one_issues(source_code, 0, [])


if __name__ == '__main__':
    unittest.main()
