# When In Rome

**AI-Driven Code Stylist that enforces team conventions.**  
**After all, when in Rome, you should do as the Romans do.**

## Overview

Imagine you’ve just completed a solid coding session and put up a PR for review. Now, imagine another engineer comes along and points out seven different style convention violations during their code review that need to be addressed. Wouldn’t it be nice if something had flagged these before you committed the code? That’s where When In Rome comes in.

When In Rome is an AI-driven code stylist that helps teams enforce their coding conventions, reducing review cycles and improving code quality. Our tool ensures that the code adheres to team-defined conventions before submission, saving everyone valuable time.

## Features (MVP)

- **AI-Driven Name Recommendations**: Automatically check variable and function names against your team’s coding conventions, ensuring consistency and readability.
- **Quick Fix Suggestions**: Receive suggestions to fix naming and style violations directly in your IDE, with options to apply changes immediately or review them first.
- **Test Suite Conventions**: Notify developers to add or update test files when changes are detected in API views. *MVP: Triggers for files within "api" or "views" folders.*
- **Supports Multiple Languages**: Initial support for Python, JavaScript, and TypeScript, with plans to expand to more languages.

## Planned Features

- **Custom Rule Creation**: Define your team's custom rules or modify AI-enhanced templates to fit your project’s needs.
- **Flexible Configuration**: Customize the extension settings to align with your team's specific coding conventions, such as adjusting rule severity or excluding files.

## How It Works

1. **Setup and Configuration**: Install the extension and set up your team's coding conventions via a GUI or a configuration file.
2. **Code Analysis**: Real-time code analysis highlights any deviations from established conventions as you type.
3. **Quick Fixes**: Offers actionable recommendations for quick corrections, streamlining your coding process.
4. **Automatic Suggestions**: AI-driven suggestions help maintain consistency across your team's codebase.
5. **Test Suite Enforcement**: Alerts you to update or create tests following changes in designated "api" or "views" directories, ensuring code changes are adequately tested.

## Getting Started

1. **Install the Extension**: [VS Code Marketplace](#) (Add your marketplace link here)
2. **Configure Conventions**: Follow the instructions in the UI or use the `.whenInRomeConfig` file.
3. **Start Writing Code**: Begin coding as usual while the extension monitors and helps improve your work.
4. **Review Violations**: Check and resolve any flagged violations in the Problems panel.

## Pricing & Free Trial

When In Rome is a paid product with a monthly subscription plan. All new users get a 14-day free trial with full feature access.

## Known Issues & Limitations

- **Initial Language Support**: Currently, only Python, Django, JavaScript, and TypeScript are supported.
- **False Positives**: When In Rome is an MVP undergoing rapid development. As an early adopter, you get a front-row seat to watch the fun. This means that the tool may generate inaccurate diagnostics and recommendations. If you encounter any issues, pleae report them to [support@alchemizedsoftware.com](mailto:support@alchemizedsoftware.com)

## Support & Feedback

- **Support**: Reach out to [support@alchemizedsoftware.com](mailto:support@alchemizedsoftware.com) for help.

## Contribution Guidelines

Interested in contributing to When In Rome? Please reach out to [hello@alchemizedsoftware.com](mailto:hello@alchemizedsoftware.com)

## License

When In Rome is a proprietary software application. Please review the [LICENSE.md](LICENSE) file for details.