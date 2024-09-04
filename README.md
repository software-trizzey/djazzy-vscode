> **🚀 Beta Release Notice**
>
> Djangoly is currently in **free Beta mode**. During this phase, you can use all features at no cost. Please note:
>
> - The extension is under active development and subject to changes.
> - You may encounter bugs or unexpected behavior.
> - Certain features are subject to daily usage limits to prevent abuse.
> - We greatly appreciate your feedback to help improve the extension.

# Djangoly: Write Cleaner, Faster, Scalable Django Code

Djangoly is a VS Code extension built for Django developers (surprise, surprise). It uses static analysis to ensure your project aligns with Django best practices and conventions. You can install the extension via the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Alchemized.djangoly) or by searching for `djangoly` in your IDE's extension tab.

> Note: Djangoly requires _Python 3.9_ or higher to function properly. Please ensure your environment meets this requirement before using the extension.

### 🔑 API Key Required

Access to Djangoly currently requires an API key. To obtain an API key and participate in our beta program, you can [signup here](https://forms.gle/gEEZdfhWpQyQh2qVA).

We appreciate your interest in being an early adopter and helping us shape Djangoly. Thank you for your support, and we look forward to having you on board!

## Features ✨

- **Django-Specific Linting**: Automatically check your Django code against best practices and common pitfalls, including:

  - **Complex View Detection**: Flags Django views with high complexity and suggests that they be refactored to follow the **Fat Model, Thin View** or **Services** design patterns. This rule reduces view complexity and promotes maintainability and scalability.
  - **ForeignKey Validation**: Ensures all `ForeignKey` fields have a `related_name` and `on_delete` argument specified to avoid common pitfalls in query relationships and data management.
  - **Raw SQL Query Detection**: Flags direct usage of raw SQL queries, including `raw()` and `connection.cursor()`. These can bypass Django ORM protections and introduce security vulnerabilities. Djangoly suggests safer alternatives using Django's ORM.
  - **CharField and TextField Nullability**: Ensures `CharField` and `TextField` fields are not incorrectly marked as `null=True`, which can lead to inconsistencies in data integrity.
  - **Missing Exception Handling Detection**: Flags Django functional views and methods in class-based views that lack exception handling. This feature helps you ensure that error handling is properly implemented, improving the robustness and stability of your Django application.
- **Security Checks**: Includes several security checks to help ensure your Django project follows best practices for security:

  - **DEBUG Setting:** Checks if `DEBUG` is set to `True`. This setting should be `False` in production environments.
  - **SECRET_KEY Protection:** Verifies that the `SECRET_KEY` is not hardcoded in your settings file.
  - **ALLOWED_HOSTS Configuration**: Checks the `ALLOWED_HOSTS` setting for potential security issues.
  - **COOKIE Settings**: Ensures the `CSRF_COOKIE_SECURE` and `SESSION_COOKIE_SECURE` settings are set to `True` for production environments.
- **Test Suite Conventions**: Notify developers to add or update test files when changes are detected in Django views or models.
- **Redundant Comment Detection**: Flags comments that do not contribute additional information or context to the code.

## Quick Start 🏃‍♂️💨

1. **Get an API Key**: If you don't already have an API key, you can signup for one via this [form](https://forms.gle/gEEZdfhWpQyQh2qVA).
2. **Install the Extension**: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Alchemized.djangoly)
3. **Set Up Your Django Project**: If you haven't already, set up a Django project in your workspace.
4. **Configure Django Settings**: Open the extension settings in VS Code and configure your Django-specific settings.
5. **Start Coding**: Begin developing your Django project. The extension will automatically start analyzing your code.
6. **Review Suggestions**: Check the Problems panel in VS Code for Django best practice suggestions and quick fixes.

**Note**: To modify the extension rules, access these settings by going to `Preferences → Settings → Extensions → Djangoly`.

## How Djangoly Improves Your Code 🧑‍🏫

### 1. Missing Exception Handling Detection

![Djangoly exception handler demo](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/djangoly-exception-handler-demo.gif)

Djangoly ensures that your Django views and methods have proper error handling. It flags functions that lack try-except blocks and can create exception handlers based on your preferences and the function's context.

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

### 2. Test Suite Conventions

![Djangoly untested code demo](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/flag-untested-api-code.gif)
Djangoly reminds you to create and update test files when you modify your Django views or models.

## Known Issues & Limitations 🐞

- **False Positives**: As an MVP undergoing rapid development, Djangoly may generate inaccurate diagnostics and recommendations. If you encounter any issues, please report them to [support@djangoly.com](mailto:support@djangoly.com).
