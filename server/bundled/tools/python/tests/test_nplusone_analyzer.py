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
                'fields': {'customer': 'ForeignKey', 'status': 'CharField'},
                'relationships': {
                    'customer': {'type': 'ForeignKey', 'properties': {'related_name': '"orders"', 'on_delete': 'models.CASCADE'}},
                    'orderitem_set': {'type': 'OneToMany', 'properties': {'related_name': '"order"', 'on_delete': 'models.CASCADE'}}
                },
                'parent_models': ['models.Model']
            },
            'OrderItem': {
                'fields': {'order': 'ForeignKey', 'product': 'ForeignKey', 'quantity': 'IntegerField'},
                'relationships': {
                    'order': {'type': 'ForeignKey', 'properties': {'related_name': '"orderitem_set"', 'on_delete': 'models.CASCADE'}},
                    'product': {'type': 'ForeignKey', 'properties': {'related_name': '"order_items"', 'on_delete': 'models.CASCADE'}}
                },
                'parent_models': ['models.Model']
            },
            'Product': {
                'fields': {'name': 'CharField', 'category': 'ForeignKey'},
                'relationships': {
                    'category': {'type': 'ForeignKey', 'properties': {'related_name': '"products"', 'on_delete': 'models.CASCADE'}},
                    'orderitem_set': {'type': 'OneToMany', 'properties': {'related_name': '"product"', 'on_delete': 'models.CASCADE'}}
                },
                'parent_models': ['models.Model']
            },
            'Category': {
                'fields': {'name': 'CharField'},
                'relationships': {'products': {'type': 'OneToMany', 'properties': {'related_name': '"category"', 'on_delete': 'models.CASCADE'}}},
                'parent_models': ['models.Model']
            },
            'Customer': {
                'fields': {'name': 'CharField'},
                'relationships': {
                    'order_set': {'type': 'OneToMany', 'properties': {'related_name': '"customer"', 'on_delete': 'models.CASCADE'}}
                },
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
        self.assert_n_plus_one_issues(source_code, 2, ['user.orders.all', 'order.item'])

    def test_select_related_in_nested_loops(self):
        source_code = textwrap.dedent("""
            def get_users_and_orders():
                users = User.objects.select_related('orders')
                for user in users:
                    for order in user.orders.all():
                        print(order.item.name)
        """)
        self.assert_n_plus_one_issues(source_code, 2, ['order.item'])

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

    def test_get_customer_orders_n_plus_one(self):
        source_code = textwrap.dedent("""
            def get_customer_orders(customer_id):
                orders = Order.objects.filter(customer_id=customer_id)
                for order in orders:
                    order_items = OrderItem.objects.filter(order_id=order.id)
                    order.items = order_items
                    for item in order_items:
                        item.product = Product.objects.get(id=item.product_id)
                return orders
        """)
        self.assert_n_plus_one_issues(source_code, 2, ['OrderItem.objects.filter', 'Product.objects.get'])

    def test_get_order_details_n_plus_one(self):
        source_code = textwrap.dedent("""
            def get_order_details(order_id):
                order = Order.objects.get(id=order_id)
                order_items = OrderItem.objects.filter(order_id=order.id)
                for item in order_items:
                    product = Product.objects.get(id=item.product_id) 
                    category = product.category.name
                    print(category)
                return order
        """)
        self.assert_n_plus_one_issues(source_code, 2, ['Product.objects.get', 'product.category'])

    # FIXME: we should differentiate between related fields and non-related fields (order.status should not be flagged)
    def test_get_orders_by_status_n_plus_one(self):
        source_code = textwrap.dedent("""
            def get_orders_by_status(status):
                orders = Order.objects.filter(status=status)
                for order in orders:
                    if order.status == 'completed':
                        customer_name = order.customer.name  # N+1 query here
                return orders
        """)
        self.assert_n_plus_one_issues(source_code, 1, ['order.customer'])

    def test_get_customers_and_orders_n_plus_one(self):
        source_code = textwrap.dedent("""
            def get_customers_and_orders():
                customers = Customer.objects.all()
                for customer in customers:
                    orders = Order.objects.filter(customer=customer)
                    for order in orders:
                        order_items = OrderItem.objects.filter(order=order)
                        for item in order_items:
                            product = Product.objects.get(id=item.product_id)  # N+1 query here
                return customers
        """)
        self.assert_n_plus_one_issues(source_code, 3, ['Order.objects.filter', 'OrderItem.objects.filter', 'Product.objects.get'])

    def test_get_product_sales_n_plus_one(self):
        source_code = textwrap.dedent("""
            def get_product_sales():
                products = Product.objects.all()
                for product in products:
                    total_sales = OrderItem.objects.filter(product=product).aggregate(Sum('quantity'))['quantity__sum']
                return products
        """)
        self.assert_n_plus_one_issues(source_code, 1, ['OrderItem.objects.filter'])

    @unittest.skip("List comprehensions are not supported yet")
    def test_get_products_with_list_comprehension_n_plus_one(self):
        source_code = textwrap.dedent("""
            def get_products_with_list_comprehension():
                categories = Category.objects.all()
                products = [Product.objects.filter(category=category) for category in categories]  # N+1 query here
                return products
        """)
        self.assert_n_plus_one_issues(source_code, 1, ['Product.objects.filter'])

    def test_get_product_category_names_n_plus_one(self):
        source_code = textwrap.dedent("""
            def get_product_category_names():
                products = Product.objects.all()
                category_names = [product.category.name for product in products]  # N+1 query here
                return category_names
        """)
        self.assert_n_plus_one_issues(source_code, 1, ['product.category'])

    def test_get_products_with_annotation_n_plus_one(self):
        source_code = textwrap.dedent("""
            def get_products_with_annotation():
                products = Product.objects.annotate(order_count=Count('orderitem'))
                for product in products:
                    if product.order_count > 10:
                        high_volume_orders = product.orderitem_set.filter(quantity__gt=5)  # Potential N+1 query here
                return products
        """)
        self.assert_n_plus_one_issues(source_code, 2, ['product.orderitem_set.filter'])


if __name__ == '__main__':
    unittest.main()
