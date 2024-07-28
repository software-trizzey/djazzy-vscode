# When In Rome, Code as The Romans Do


## Handle Style Issues In Real-time

![Quick Fix Suggestions](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/quick-fix-demo.gif)

*When In Rome highlights coding convention violations and offers immediate, actionable recommendations for fixing them, streamlining your coding process.*

## What's this thing do?

When In Rome is a code stylist that helps teams enforce their coding conventions, reducing review cycles and improving code quality. Our tool ensures that the code adheres to team-defined conventions before submission, saving everyone valuable time.

## Features ✨

- **AI-Driven Name Recommendations**: Automatically check variable and function names against your team’s coding conventions, ensuring consistency and readability.
- **Quick Fix Suggestions**: Receive suggestions to fix naming and style violations directly in your IDE, with options to apply changes immediately or review them first.
- **Configurable Rules**: Simple rule configurations are available directly within the extension settings panel, allowing you to customize naming and style guidelines to match your team's standards.
- **Redundant Comment Detection**: Automatically flags comments that do not contribute additional information or context to the code below them, helping to keep your codebase clean and efficient. Comments marked with '@rome-ignore', 'TODO', or 'FIXME' are intelligently ignored to preserve necessary notes.
- **Test Suite Conventions**: Notify developers to add or update test files when changes are detected in API views. *MVP: Triggers for files within "api" or "views" folders.*
- **Supports Multiple Languages**: Initial support for Python, JavaScript, and TypeScript, with plans to expand to more languages.
- **Django N+1 Query Detection**: Automatically identifies potential N+1 query issues in Django projects. The extension flags instances where related field access occurs within loops without proper optimization techniques like select_related() or prefetch_related().

## Planned Features 🧭

- **Custom Rule Creation**: Define your team's custom rules or modify AI-enhanced templates to fit your project’s needs.
- **Flexible Configuration**: Customize the extension settings to align with your team's specific coding conventions, such as adjusting rule severity or excluding files.

## Quick Start 🏃‍♂️💨

1. **Install the Extension**: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Alchemized.when-in-rome)
2. **Configure Conventions**: Set up your team's coding conventions via a GUI or a configuration file.
3. **Start Coding**: Begin coding as usual while the extension monitors and helps improve your work.
4. **Review Violations**: Check and resolve any flagged violations in the Problems panel.

## Configuration 🧪

### Simple Rule Configuration

- **Enable/Disable**: Toggle the extension on or off.
- **Check New Code Only**: Limit checks to newly written or modified code to focus on current development.
- **Notification Interval**: Set how frequently you receive reminders to review suggestions for testing business logic.
- **Language-Specific Settings**: Adjust settings for JavaScript, TypeScript, and Python, including:
  - Toggle the extension on or off for the selected language.
  - Enforcing expressive variable names.
  - Prefer descriptive names over short ones.
  - Using boolean variable prefixes.
  - Maintaining positive naming conventions.

These settings can be accessed by going to `Preferences → Settings → Extensions → When In Rome`.

## Usage 📖

1. **Setup and Configuration**: Install the extension and set up your team's coding conventions via a GUI or a configuration file.
2. **Code Analysis**: Real-time code analysis highlights any deviations from established conventions as you type.
3. **Quick Fixes**: Offers actionable recommendations for quick corrections, streamlining your coding process.
4. **Automatic Suggestions**: AI-driven suggestions help maintain consistency across your team's codebase.
5. **Test Suite Enforcement**: Alerts you to update or create tests following changes in designated "api" or "views" directories, ensuring code changes are adequately tested.
6. **Django N+1 Query Detection**

The extension analyzes your Django code to identify potential N+1 query issues.
It focuses on detecting related field access within loops that aren't optimized with select_related() or prefetch_related().
When a potential N+1 query is detected, the extension will highlight the problematic code and provide a diagnostic message.
Use the quick fix suggestions to review and optimize your database queries, improving your Django application's performance.

Example of a flagged N+1 query:
```python
# This code will be flagged as a potential N+1 query
for item in items:
    print(item.related_object.name)  # Accessing a related object inside a loop
```

Optimized version:
```python
# Using select_related to optimize the query
items = items.select_related('related_object')
for item in items:
    print(item.related_object.name)  # No additional queries
```

## Pricing 🤑

When In Rome is currently in alpha mode and under rapid development. However, we plan to convert this to a paid product with a monthly subscription plan. All new users get a 14-day free trial with full feature access.

## Feedback ✍️

We would love to hear your feedback! Please reach out to [support@rome.dev](mailto:support@rome.dev) for any questions, suggestions, or issues.

## Known Issues & Limitations 🐞

- **Initial Language Support**: Currently, only Python, JavaScript, and TypeScript are supported.
- **False Positives**: As an MVP undergoing rapid development, When In Rome may generate inaccurate diagnostics and recommendations. If you encounter any issues, please report them to [support@rome.dev](mailto:support@rome.dev).
- **Django N+1 Query Detection**: The current implementation focuses on simple loop structures and may not catch all complex scenarios.
It may produce some false positives in cases where optimizations are applied outside the immediate function scope.
The detection is based on static analysis and may not account for dynamic query optimizations.

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

