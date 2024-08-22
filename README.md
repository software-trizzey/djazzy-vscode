# Djangoly: Write Cleaner, Faster, Scalable Django Code

> **🚀 Beta Release Notice**
>
> Djangoly is currently in **free Beta mode**. During this phase, you can use all features at no cost. Please note:
>
> - The extension is under active development and subject to changes.
> - You may encounter bugs or unexpected behavior.
> - We greatly appreciate your feedback to help improve the extension.


## Features (MVP) ✨

- **Django N+1 Query Detection**: Identifies potential N+1 query issues in Django projects, flagging instances where related field access occurs within loops without proper optimization.
- **Django-Specific Linting**: Automatically check your Django code against best practices and common pitfalls.
- **Test Suite Conventions**: Notify developers to add or update test files when changes are detected in Django views or models.
- **Redundant Comment Detection**: Flags comments that do not contribute additional information or context to the code.

## Security Checks (MVP) 🔒

Djangoly includes several security checks to help ensure your Django project follows best practices for security:

1. **DEBUG Setting:** Checks if `DEBUG` is set to `True`. This setting should be `False` in production environments.
2. **SECRET_KEY Protection:** Verifies that the `SECRET_KEY` is not hardcoded in your settings file.
3. **ALLOWED_HOSTS Configuration**: Checks the `ALLOWED_HOSTS` setting for potential security issues.
4. **COOKIE Settings**: Ensures the `CSRF_COOKIE_SECURE` and `SESSION_COOKIE_SECURE` settings are set to `True` for production environments.

These security checks help you identify common configuration mistakes that could lead to security vulnerabilities in your Django application. Djangoly provides warnings and recommendations to help you maintain a secure Django environment, especially when preparing for production deployment.

## Quick Start (Free) 🏃‍♂️💨

1. **Install the Extension**: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Alchemized.djangoly)
2. **Set Up Your Django Project**: If you haven't already, set up a Django project in your workspace.
3. **Configure Django Settings**: Open the extension settings in VS Code and configure your Django-specific settings.
4. **Start Coding**: Begin developing your Django project. The extension will automatically start analyzing your code.
5. **Review Suggestions**: Check the Problems panel in VS Code for Django best practice suggestions and quick fixes.

## How Djangoly Improves Your Code 🧑‍🏫

### 1. N+1 Query Detection and Optimization

Before:

```python
def list_books(request):
    books = Book.objects.all()
    for book in books:
        print(f"{book.title} by {book.author.name}")  # This causes N+1 queries
```

After:

```python
def list_books(request):
    books = Book.objects.select_related('author').all()
    for book in books:
        print(f"{book.title} by {book.author.name}")  # No additional queries
```

Djangoly detects the potential N+1 query issue and suggests using `select_related()` to optimize the database queries.

### 2. Security Settings Check

Before (in settings.py):

```python
DEBUG = True
SECRET_KEY = 'my_secret_key'
ALLOWED_HOSTS = ['*']
```

After (with Djangoly warnings):

```python
DEBUG = False  # Djangoly: Ensure DEBUG is False in production
SECRET_KEY = os.environ.get('SECRET_KEY')  # Djangoly: Use environment variables for sensitive data
ALLOWED_HOSTS = ['example.com', 'www.example.com']  # Djangoly: Specify allowed hosts explicitly
```

Djangoly identifies potential security risks in your Django settings and suggests safer alternatives.

### 3. Test Suite Conventions

Before (missing test file):

```python
# app/views.py
def important_view(request):
    # Some important logic here
    pass

# No corresponding test file
```

After (with Djangoly reminder):

```python
# app/views.py
def important_view(request):
    # Some important logic here
    pass

# app/tests/test_views.py (Djangoly suggests creating this file)
from django.test import TestCase

class TestImportantView(TestCase):
    def test_important_view(self):
        # Djangoly: Remember to add tests for the important_view function
        pass
```

Djangoly reminds you to create and update test files when you modify your Django views or models.

### 4. Redundant Comment Detection

Before:

```python
# This function adds two numbers
def add_numbers(a, b):
    # sum these numbers
    return a + b
```

After (with Djangoly suggestion):

```python
def add_numbers(a, b):
    # Djangoly: Consider removing redundant comments
    return a + b 
```

Djangoly identifies comments that don't provide additional context and suggests removing them to improve code readability.

## Django N+1 Query Detection 🕵️‍♂️

![Djangoly Demo](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/djangoly-nplusone-query-fix-demo.gif)

Djangoly includes a powerful static analysis tool to help identify potential N+1 query issues in your Django projects. This feature examines your code to flag instances where database queries might be inefficiently executed within loops.

For more information about how the scoring system works, please see the [N+1 Query Detection Scoring System](./nplusone-scoring.md).

## Configuration 🧪

### General Settings

- **Check New Code Only**: Limit checks to newly written or modified code to focus on current development.
- **Notification Interval**: Set how frequently you receive reminders to review suggestions for testing business logic.
- **Language-Specific Settings**: Adjust settings for Python linting support.
- **N+1 Query Detection Sensitivity**: Adjust the sensitivity of N+1 query detection.

Access these settings by going to `Preferences → Settings → Extensions → Djangoly`.

## Known Issues & Limitations 🐞

- **False Positives**: As an MVP undergoing rapid development, Djangoly may generate inaccurate diagnostics and recommendations. If you encounter any issues, please report them to [support@djangoly.com](mailto:support@djangoly.com).
- **Django N+1 Query Detection**: The current implementation focuses on simple loop structures and may not catch all complex scenarios. It may produce some false positives in cases where optimizations are applied outside the immediate function scope. The detection is based on static analysis and may not account for dynamic query optimizations.

## Contribution Guidelines 👯‍♀️

We <3 contributions big and small. In priority order (although everything is appreciated) with the most helpful first:

 - Vote on features or get early access to beta functionality in our roadmap
 - Open a PR (see our instructions on developing PostHog locally)
 - Submit a feature request or bug report

## Open-source License 👮‍♂️

This repo is available under the MIT expat license. We plan to add paid features at some point that will be covered under another license. Stay tuned.
