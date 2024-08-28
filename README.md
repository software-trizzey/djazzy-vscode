> **🚀 Beta Release Notice**
>
> Djangoly is currently in **free Beta mode**. During this phase, you can use all features at no cost. Please note:
>
> - The extension is under active development and subject to changes.
> - You may encounter bugs or unexpected behavior.
> - We greatly appreciate your feedback to help improve the extension.

# Djangoly: Write Cleaner, Faster, Scalable Django Code

Djangoly is a VS Code extension built for Django developers (surprise, surprise). It uses static analysis to ensure your project aligns with Django best practices and conventions. You can install the extension via the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Alchemized.djangoly) or by searching for `djangoly` in your IDE's extension tab.


## Features ✨

- **Django N+1 Query Detection**: Identifies potential N+1 query issues in Django projects, flagging instances where related field access occurs within loops without proper optimization.
- **Django-Specific Linting**: Automatically check your Django code against best practices and common pitfalls, including:
  - **Complex View Detection**: Flags Django views with high complexity and suggests that they be refactored to follow the **Fat Model, Thin View** or **Services** design patterns. This rule reduces view complexity and promotes maintainability and scalability.
  - **ForeignKey Validation**: Ensures all `ForeignKey` fields have a `related_name` and `on_delete` argument specified to avoid common pitfalls in query relationships and data management.
  - **Raw SQL Query Detection**: Flags direct usage of raw SQL queries, including `raw()` and `connection.cursor()`. These can bypass Django ORM protections and introduce security vulnerabilities. Djangoly suggests safer alternatives using Django's ORM.
  - **CharField and TextField Nullability**: Ensures `CharField` and `TextField` fields are not incorrectly marked as `null=True`, which can lead to inconsistencies in data integrity.
- **Security Checks**: Includes several security checks to help ensure your Django project follows best practices for security:
  - **DEBUG Setting:** Checks if `DEBUG` is set to `True`. This setting should be `False` in production environments.
  - **SECRET_KEY Protection:** Verifies that the `SECRET_KEY` is not hardcoded in your settings file.
  - **ALLOWED_HOSTS Configuration**: Checks the `ALLOWED_HOSTS` setting for potential security issues.
  - **COOKIE Settings**: Ensures the `CSRF_COOKIE_SECURE` and `SESSION_COOKIE_SECURE` settings are set to `True` for production environments.
- **Test Suite Conventions**: Notify developers to add or update test files when changes are detected in Django views or models.
- **Redundant Comment Detection**: Flags comments that do not contribute additional information or context to the code.

## Quick Start 🏃‍♂️💨

1. **Install the Extension**: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Alchemized.djangoly)
2. **Set Up Your Django Project**: If you haven't already, set up a Django project in your workspace.
3. **Configure Django Settings**: Open the extension settings in VS Code and configure your Django-specific settings.
4. **Start Coding**: Begin developing your Django project. The extension will automatically start analyzing your code.
5. **Review Suggestions**: Check the Problems panel in VS Code for Django best practice suggestions and quick fixes.

**Note**: To modify the extension rules, access these settings by going to `Preferences → Settings → Extensions → Djangoly`.

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

![Djangoly untested code demo](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/flag-untested-api-code.gif)
Djangoly reminds you to create and update test files when you modify your Django views or models.

## Django N+1 Query Detection 🕵️‍♂️

![Djangoly N+1 demo gif](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/djangoly-nplusone-query-fix-demo.gif)

Djangoly includes a powerful static analysis tool to help identify potential N+1 query issues in your Django projects. This feature examines your code to flag instances where database queries might be inefficiently executed within loops.

For more information about how the scoring system works, please see the [N+1 Query Detection Scoring System](./nplusone-scoring.md).

## Known Issues & Limitations 🐞

- **False Positives**: As an MVP undergoing rapid development, Djangoly may generate inaccurate diagnostics and recommendations. If you encounter any issues, please report them to [support@djangoly.com](mailto:support@djangoly.com).
- **Django N+1 Query Detection**: The current implementation focuses on simple loop structures and may not catch all complex scenarios. It may produce some false positives in cases where optimizations are applied outside the immediate function scope. The detection is based on static analysis and may not account for dynamic query optimizations.

## Contribution Guidelines 👯‍♀️

If you're interested in helping out you can do one of the following:

- Open a PR (see our instructions on developing PostHog locally)
- Submit a feature request or bug report

## Open-source License 👮‍♂️

This repo is available under the MIT expat license. We plan to add paid features at some point that will be covered under another commercial license. Stay tuned.
