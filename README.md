# When In Rome: Your Django Best Practices Companion

> **🚀 Beta Release Notice**
> 
> When In Rome is currently in **free Beta mode**. During this phase, you can use all features at no cost. Please note:
> 
> - The extension is under active development and subject to changes.
> - You may encounter bugs or unexpected behavior.
> - We greatly appreciate your feedback to help improve the extension.
> 
> Thank you for being an early adopter and helping us shape When In Rome!

![When In Rome Logo](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/quick-fix-demo.gif)

*When In Rome highlights Django best practice violations and offers immediate, actionable recommendations for fixing them, streamlining your development process.*

## What's this thing do?

When In Rome is a powerful VS Code extension designed to help teams enforce Django best practices and coding conventions. Our tool ensures that your Django projects adhere to established best practices and team-defined conventions, reducing review cycles and improving code quality.

## Features ✨

- **Django-Specific Linting**: Automatically check your Django code against best practices and common pitfalls.
- **Django N+1 Query Detection**: Identifies potential N+1 query issues in Django projects, flagging instances where related field access occurs within loops without proper optimization.
- **Quick Fix Suggestions**: Receive suggestions to fix Django-related issues directly in your IDE, with options to apply changes immediately or review them first.
- **Test Suite Conventions**: Notify developers to add or update test files when changes are detected in Django views or models.
- **AI-Driven Name Recommendations**: Ensure consistency and readability in your Django codebase with AI-powered naming suggestions.
- **Redundant Comment Detection**: Automatically flags comments that do not contribute additional information or context to the code.
- **Configurable Rules**: Customize naming and style guidelines to match your team's standards directly within the extension settings panel.
- **JavaScript/TypeScript Support**: While focusing on Django, the extension still supports linting and best practices for JavaScript and TypeScript files commonly used in modern Django projects.

## Quick Start 🏃‍♂️💨

1. **Install the Extension**: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Alchemized.when-in-rome)
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

### Django ORM Best Practices

Suggests optimizations for your ORM usage:

```python
# This query will be flagged
users = User.objects.filter(is_active=True).order_by('-last_login')[:10]

# Suggested optimization
users = User.objects.filter(is_active=True).order_by('-last_login').select_related('profile')[:10]
```

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

Access these settings by going to `Preferences → Settings → Extensions → When In Rome`.

## Usage 📖

1. **Django Project Analysis**: Real-time analysis of your Django code, highlighting deviations from best practices as you type.
2. **Quick Fixes for Django Issues**: Offers actionable recommendations for quick corrections of Django-specific issues.
3. **Django N+1 Query Detection**: The extension analyzes your Django code to identify potential N+1 query issues.
4. **Test Suite Enforcement**: Alerts you to update or create tests following changes in Django views or models.
5. **JavaScript/TypeScript Support**: Continues to provide linting and best practice suggestions for JS/TS files in your Django project.

## Pricing 🤑

When In Rome is currently available for free as part of our Beta program. During this period, all features are accessible to all users at no cost. We greatly appreciate your feedback and participation in helping us improve the extension.

As we move towards a full release, we plan to introduce a paid subscription model. Beta users will be given advance notice of any changes to our pricing structure and may be eligible for special offers.

## Feedback ✍️

Your feedback is crucial during this Beta phase! We're eager to hear about your experience, suggestions, and any issues you encounter. Here's how you can help:

- **General Feedback**, **Report Bugs**, **Feature Requests**: If you encounter any issues, have an idea for a new feature, or any other feedback, please email us at [support@rome.dev](mailto:support@rome.dev).

Your input directly influences the development of When In Rome. Thank you for helping us create a better tool for the Django community!

## Roadmap 🗺️

Here's what we're planning for future releases:

1. **Fat Models, Thin Views**: Maintain clean, scalable architecture
2. **Security Checks**: Ensure your Django settings are production-ready
3. **Django REST Framework Support**: Add specific checks and suggestions for DRF best practices.
4. **Custom Rule Creator**: Allow users to define and share custom rules for their team's specific needs.

We're always open to suggestions for our roadmap. Feel free to contribute your ideas through our feedback channels!

## Known Issues & Limitations 🐞

- **Initial Language Support**: Currently, Python (Django), JavaScript, and TypeScript are supported.
- **False Positives**: As an MVP undergoing rapid development, When In Rome may generate inaccurate diagnostics and recommendations. If you encounter any issues, please report them to [support@rome.dev](mailto:support@rome.dev).
- **Django N+1 Query Detection**: The current implementation focuses on simple loop structures and may not catch all complex scenarios. It may produce some false positives in cases where optimizations are applied outside the immediate function scope. The detection is based on static analysis and may not account for dynamic query optimizations.

## Contribution Guidelines 👯‍♀️

Interested in contributing to When In Rome? Please reach out to [hello@rome.dev](mailto:hello@rome.dev).

## License 👮‍♂️

When In Rome is proprietary software. Use of this software is subject to the terms and conditions of the license agreement provided with the software. The software is available for purchase, and its use is limited to the licensed terms agreed upon purchasing or subscribing.

### Usage

Purchasing a license to When In Rome grants you a non-exclusive, non-transferable right to use and incorporate the extension as per the license terms and conditions specified in the agreement. Unauthorized copying, sharing, distribution, or reproduction of any part of this software is strictly prohibited and constitutes a violation of applicable copyright laws.

### Restrictions

- You may not modify, decompile, or reverse-engineer any part of this software in any way.
- You may not redistribute or sublicense this software.
- You may not use this software in a manner that contravenes any laws or regulations.

### Trial Version

When In Rome may offer a trial version with limited features which can be used prior to purchasing a full license. This trial is provided for evaluation purposes only, subject to the terms of the trial agreement.

For full license details and rights, please refer to the license agreement provided upon purchase or installation, or contact our support team at [support@rome.dev](mailto:support@rome.dev).

**Note:** This software uses software components from other open source software which are licensed under their own respective open-source licenses. Please refer to the documentation for further information on licensing for these components.