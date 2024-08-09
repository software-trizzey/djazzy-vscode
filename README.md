# Djangoly: Write Cleaner, Faster, Scalable Django Code

> **🔑 API Key Required**
> Access to Djangoly currently requires an API key. To obtain an API key and participate in our beta program, please email [hello@alchemizedsoftware.com](mailto:hello@alchemizedsoftware.com). We appreciate your interest and look forward to having you on board!

> **🚀 Beta Release Notice**
> 
> Djangoly is currently in **free Beta mode**. During this phase, you can use all features at no cost. Please note:
> 
> - The extension is under active development and subject to changes.
> - You may encounter bugs or unexpected behavior.
> - We greatly appreciate your feedback to help improve the extension.
> 
> Thank you for being an early adopter and helping us shape Djangoly!

![Djangoly Logo](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/quick-fix-demo.gif)

*Djangoly highlights Django best practice violations and offers immediate, actionable recommendations for fixing them, streamlining your development process.*

## What's this thing do?

Djangoly is a powerful VS Code extension designed to help teams enforce Django best practices and coding conventions. Our tool ensures that your Django projects adhere to established best practices and team-defined conventions, reducing review cycles and improving code quality.

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

## Quick Start 🏃‍♂️💨

1. **Get an API Key**: Email [hello@alchemizedsoftware.com](mailto:hello@alchemizedsoftware.com) to request an API key.
1. **Install the Extension**: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Alchemized.djangoly)
2. **Set Up Your Django Project**: If you haven't already, set up a Django project in your workspace.
3. **Configure Django Settings**: Open the extension settings in VS Code and configure your Django-specific settings.
4. **Start Coding**: Begin developing your Django project. The extension will automatically start analyzing your code.
5. **Review Suggestions**: Check the Problems panel in VS Code for Django best practice suggestions and quick fixes.

## Key Django Features 🎯

### Django N+1 Query Detection

Automatically identifies potential performance issues related to database queries. For example:

```python
# This code will be flagged as a potential N+1 query
for book in books:
    print(book.author.name)  # Accessing a related object inside a loop

# Suggested optimization
books = books.select_related('author')
for book in books:
    print(book.author.name)  # No additional queries
```

### Daily Usage Limit
To ensure fair usage and maintain service quality, we've implemented a daily limit for N+1 query validations:

- **Limit**: *200 requests per day*
- **Reset**: The limit resets at midnight UTC
- **Exceeding the limit**: Once you reach the daily limit, you'll receive a notification, and N+1 query detection will be temporarily unavailable until the next day
- **Tracking**: The limit is tracked per API key, so each user has their own daily allowance

This limit helps us provide a consistent and reliable service to all our users while allowing for extensive use of the N+1 query detection feature during your development process.

If you find that you consistently need more than 200 validations per day, please contact us at [support@alchemizedsoftware.com](mailto:support@alchemizedsoftware.com) to discuss your needs.

## Understanding N+1 Query Scores 📊

Djangoly uses a scoring system to help you prioritize and address potential N+1 query issues in your Django project. Here's what you need to know:

### What do the scores mean?

- **Score Range**: 0-100
- **Severity Levels**:
  - 0-30:   💡 Hint (Low priority)
  - 31-60:  ℹ️ Information (Medium-low priority)
  - 61-89:  🔶 Warning (Medium-high priority)
  - 90-100: 🛑 Error (High priority)

The higher the score, the more likely the issue is to cause performance problems in your application.

### How are scores calculated?

Scores are based on several factors:

1. **Query in a loop**: Highest weight. Performing database queries inside loops is a common cause of N+1 problems.
2. **Use of query methods**: Moderate weight. Certain query methods (like `filter`, `get`, etc.) used inefficiently can lead to N+1 issues.
3. **Related field access**: Lower weight. Accessing related fields without proper optimization can cause extra queries.
4. **Use of aggregate methods**: Lowest weight. While not always problematic, inefficient use of aggregate methods can contribute to N+1 issues.

### How to address N+1 query issues

1. **For high-scoring issues (Warning/Error)**:
   - Review the flagged code carefully.
   - Consider using `select_related()` or `prefetch_related()` to optimize queries.
   - Restructure loops to avoid repeated database calls.

2. **For medium-scoring issues (Information)**:
   - Evaluate the context of the query. Is it in a performance-critical part of your application?
   - Look for opportunities to optimize, but balance with code readability.

3. **For low-scoring issues (Hint)**:
   - These are often suggestions for potential optimizations.
   - Address them if you're working on optimizing that specific area of code.

### Example and Fix

```python
# High-score issue (Error):
for book in books:
    print(book.author.name)  # Accessing a related object inside a loop

# Fix:
books = books.select_related('author')
for book in books:
    print(book.author.name)  # No additional queries
```

### Best Practices

- Always test performance improvements with real data.
- Use Django's `prefetch_related()` for many-to-many relationships.
- Consider using `django-debug-toolbar` to identify N+1 queries in development.
- For complex scenarios, batch processing or custom SQL might be necessary.

Remember, while addressing N+1 queries is important for performance, it's also crucial to maintain code readability and maintainability. Always consider the trade-offs when optimizing.

For more detailed guidance on optimizing Django queries, check out the [Django documentation on database optimization](https://docs.djangoproject.com/en/stable/topics/db/optimization/).


## Configuration 🧪

### Django-Specific Settings

- **Enable/Disable Django Linting**: Toggle Django-specific linting on or off.
- **Django Version**: Specify your Django version to receive version-specific recommendations.
- **Custom Django Apps**: Configure custom Django app names for more accurate linting.
- **N+1 Query Detection Sensitivity**: Adjust the sensitivity of N+1 query detection.

### General Settings

- **Check New Code Only**: Limit checks to newly written or modified code to focus on current development.
- **Notification Interval**: Set how frequently you receive reminders to review suggestions for testing business logic.
- **Language-Specific Settings**: Adjust settings for JavaScript and TypeScript support.

Access these settings by going to `Preferences → Settings → Extensions → Djangoly`.

## Usage 📖

1. **Django Project Analysis**: Real-time analysis of your Django code, highlighting deviations from best practices as you type.
2. **Quick Fixes for Django Issues**: Offers actionable recommendations for quick corrections of Django-specific issues.
3. **Django N+1 Query Detection**: The extension analyzes your Django code to identify potential N+1 query issues.
4. **Test Suite Enforcement**: Alerts you to update or create tests following changes in Django views or models.
5. **JavaScript/TypeScript Support**: Provide linting and best practice suggestions for JS/TS files in your Django project.

## Pricing 🤑

Djangoly is currently available for free as part of our Beta program. During this period, all features are accessible to all users at no cost, with a daily limit of 200 N+1 query validations per API key. We greatly appreciate your feedback and participation in helping us improve the extension.

As we move towards a full release, we plan to introduce a paid subscription model, which may include higher or unlimited daily validation limits. Beta users will be given advance notice of any changes to our pricing structure and may be eligible for special offers.

## Feedback ✍️

Your feedback is crucial during this Beta phase! We're eager to hear about your experience, suggestions, and any issues you encounter. Here's how you can help:

- **General Feedback**, **Report Bugs**, **Feature Requests**: If you encounter any issues, have an idea for a new feature, or any other feedback, please email us at [support@alchemizedsoftware.com](mailto:support@alchemizedsoftware.com).

Your input directly influences the development of Djangoly. Thank you for helping us create a better tool for the Django community!

## Roadmap 🗺️

Here's what we're planning for future releases:

1. **Fat Models, Thin Views**: Maintain clean, scalable architecture
2. **Security Checks**: Ensure your Django settings are production-ready
3. **Django REST Framework Support**: Add specific checks and suggestions for DRF best practices.
4. **Custom Rule Creator**: Allow users to define and share custom rules for their team's specific needs.

We're always open to suggestions for our roadmap. Feel free to contribute your ideas through our feedback channels!

## Known Issues & Limitations 🐞

- **Initial Language Support**: Currently, Python (Django), JavaScript, and TypeScript are supported.
- **False Positives**: As an MVP undergoing rapid development, Djangoly may generate inaccurate diagnostics and recommendations. If you encounter any issues, please report them to [support@alchemizedsoftware.com](mailto:support@alchemizedsoftware.com).
- **Django N+1 Query Detection**: The current implementation focuses on simple loop structures and may not catch all complex scenarios. It may produce some false positives in cases where optimizations are applied outside the immediate function scope. The detection is based on static analysis and may not account for dynamic query optimizations.

## Contribution Guidelines 👯‍♀️

Interested in contributing to Djangoly? Please reach out to [support@alchemizedsoftware.com](mailto:support@alchemizedsoftware.com).

## License 👮‍♂️

Djangoly is proprietary software. Use of this software is subject to the terms and conditions of the license agreement provided with the software. The software is available for purchase, and its use is limited to the licensed terms agreed upon purchasing or subscribing.

### Usage

Purchasing a license to Djangoly grants you a non-exclusive, non-transferable right to use and incorporate the extension as per the license terms and conditions specified in the agreement. Unauthorized copying, sharing, distribution, or reproduction of any part of this software is strictly prohibited and constitutes a violation of applicable copyright laws.

### Restrictions

- You may not modify, decompile, or reverse-engineer any part of this software in any way.
- You may not redistribute or sublicense this software.
- You may not use this software in a manner that contravenes any laws or regulations.

### Trial Version

Djangoly may offer a trial version with limited features which can be used prior to purchasing a full license. This trial is provided for evaluation purposes only, subject to the terms of the trial agreement.

For full license details and rights, please refer to the license agreement provided upon purchase or installation, or contact our support team at [support@alchemizedsoftware.com](mailto:support@alchemizedsoftware.com).

**Note:** This software uses software components from other open source software which are licensed under their own respective open-source licenses. Please refer to the documentation for further information on licensing for these components.