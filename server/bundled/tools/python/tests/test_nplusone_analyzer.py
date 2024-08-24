import unittest
from unittest.mock import patch
import textwrap

from nplusone.nplusone_analyzer import NPlusOneDetector


class TestNPlusOneDetector(unittest.TestCase):

    @patch('log.LOGGER')
    def test_no_n_plus_one_when_select_related(self, mock_logger):
        """
        Ensure no N+1 issue is detected when select_related is used correctly.
        """
        source_code = textwrap.dedent("""
            def get_users():
                users = User.objects.select_related('profile').all()
                for user in users:
                    print(user.profile.name)
        """)
        detector = NPlusOneDetector(source_code)
        issues = detector.analyze()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
    def test_n_plus_one_detected_in_loop(self, mock_logger):
        """
        Ensure N+1 issue is detected when accessing related fields without optimization in a loop.
        """
        source_code = textwrap.dedent("""
            def get_users():
                users = User.objects.all()
                for user in users:
                    print(user.profile.name)
        """)
        detector = NPlusOneDetector(source_code)
        issues = detector.analyze()
        self.assertEqual(len(issues), 1)
        self.assertIn('N+1 query detected', issues[0]['message'])

    @patch('log.LOGGER')
    def test_prefetch_related_skips_n_plus_one_detection(self, mock_logger):
        """
        Ensure no N+1 issue is detected when prefetch_related is used correctly.
        """
        source_code = textwrap.dedent("""
            def get_users():
                users = User.objects.prefetch_related('groups').all()
                for user in users:
                    for group in user.groups.all():
                        print(group.name)
        """)
        detector = NPlusOneDetector(source_code)
        issues = detector.analyze()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
    def test_n_plus_one_detected_with_multiple_loops(self, mock_logger):
        """
        Ensure N+1 issues are detected across multiple loops for different models.
        """
        source_code = textwrap.dedent("""
            def get_users_and_groups():
                users = User.objects.all()
                for user in users:
                    print(user.profile.name)
                groups = Group.objects.all()
                for group in groups:
                    print(group.name)
        """)
        detector = NPlusOneDetector(source_code)
        issues = detector.analyze()
        self.assertEqual(len(issues), 2)
        self.assertIn('N+1 query detected', issues[0]['message'])
        self.assertIn('N+1 query detected', issues[1]['message'])

    @patch('log.LOGGER')
    def test_nested_select_related_in_loop(self, mock_logger):
        """
        Ensure no N+1 issue is detected when nested queries are correctly optimized.
        """
        source_code = textwrap.dedent("""
            def get_users_and_posts():
                users = User.objects.select_related('profile').all()
                for user in users:
                    print(user.profile.name)
                    posts = Post.objects.filter(user=user).select_related('author')
                    for post in posts:
                        print(post.author.name)
        """)
        detector = NPlusOneDetector(source_code)
        issues = detector.analyze()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
    def test_nested_n_plus_one_with_missing_optimization(self, mock_logger):
        """
        Ensure N+1 issues are detected in nested loops when optimizations are missing.
        """
        source_code = textwrap.dedent("""
            def get_users_and_posts():
                users = User.objects.all()
                for user in users:
                    print(user.profile.name)
                    posts = Post.objects.filter(user=user)
                    for post in posts:
                        print(post.author.name)
        """)
        detector = NPlusOneDetector(source_code)
        issues = detector.analyze()
        self.assertEqual(len(issues), 2)
        self.assertIn('N+1 query detected', issues[0]['message'])
        self.assertIn('N+1 query detected', issues[1]['message'])

    @patch('log.LOGGER')
    def test_bulk_create_avoids_n_plus_one(self, mock_logger):
        """
        Ensure no N+1 issue is detected when using bulk_create within a loop.
        """
        source_code = textwrap.dedent("""
            def create_users():
                users = [User(username=f"user{i}") for i in range(10)]
                User.objects.bulk_create(users)
        """)
        detector = NPlusOneDetector(source_code)
        issues = detector.analyze()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
    def test_bulk_update_avoids_n_plus_one(self, mock_logger):
        """
        Ensure no N+1 issue is detected when using bulk_update within a loop.
        """
        source_code = textwrap.dedent("""
            def update_users():
                users = User.objects.all()
                for user in users:
                    user.is_active = False
                User.objects.bulk_update(users, ['is_active'])
        """)
        detector = NPlusOneDetector(source_code)
        issues = detector.analyze()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
    def test_filter_inside_loop_detects_n_plus_one(self, mock_logger):
        """
        Ensure N+1 issue is detected when using a filter inside a loop without optimization.
        """
        source_code = textwrap.dedent("""
            def get_user_posts():
                users = User.objects.all()
                for user in users:
                    posts = Post.objects.filter(user=user)
                    for post in posts:
                        print(post.title)
        """)
        detector = NPlusOneDetector(source_code)
        issues = detector.analyze()
        self.assertEqual(len(issues), 1)
        self.assertIn('N+1 query detected', issues[0]['message'])

    @patch('log.LOGGER')
    def test_no_n_plus_one_with_prefetch_in_nested_loop(self, mock_logger):
        """
        Ensure no N+1 issue is detected when using prefetch_related in nested loops.
        """
        source_code = textwrap.dedent("""
            def get_users_and_posts():
                users = User.objects.prefetch_related('posts').all()
                for user in users:
                    for post in user.posts.all():
                        print(post.title)
        """)
        detector = NPlusOneDetector(source_code)
        issues = detector.analyze()
        self.assertEqual(len(issues), 0)

    @patch('log.LOGGER')
    def test_select_related_in_function_call(self, mock_logger):
        """
        Ensure no N+1 issue is detected when select_related is applied within a function call.
        """
        source_code = textwrap.dedent("""
            def get_user_profile(user):
                return user.profile.name

            def get_users():
                users = User.objects.select_related('profile').all()
                for user in users:
                    print(get_user_profile(user))
        """)
        detector = NPlusOneDetector(source_code)
        issues = detector.analyze()
        self.assertEqual(len(issues), 0)


if __name__ == '__main__':
    unittest.main()
