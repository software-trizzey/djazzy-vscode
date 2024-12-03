# Djangoly: Write Cleaner, Faster, Scalable Django Code

Djangoly is a VS Code extension built for Django developers (surprise, surprise). It uses static analysis to ensure your project aligns with Django best practices and conventions. You can install the extension via the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Alchemized.djangoly) or by searching for `djangoly` in VS code's extension tab.

> Note: Djangoly requires _Python 3.9_ or higher to function properly. Please ensure your environment meets this requirement before using the extension.


## Get started for free

Djangoly is open source, and you are free to fork and host your own version of the extension. We encourage contributions and feedback from the community.

However, for the best experience and to access support, we recommend using the official VS Code extension. You can signup for free by requesting an an API key [here](https://forms.gle/gEEZdfhWpQyQh2qVA). In the future, we plan to introduce paid features to support the ongoing development and maintenance of the extension.


## Docs

Djangoly implements a comprehensive set of rules to help you write cleaner, safer, and more efficient Django code. Each rule is designed to catch common pitfalls, enforce best practices, and improve the overall quality and security of your Django projects.

For a complete list of all rules, including detailed descriptions and examples, please refer to our [Convention Rules Documentation](https://github.com/software-trizzey/djangoly-docs/blob/main/docs/CONVENTION_RULES.md).


## Djangoly highlights

### 1. Validate model fields

![Djangoly model field demo](https://raw.githubusercontent.com/software-trizzey/images/refs/heads/main/assets/images/djangoly-model-field-validation-demo.gif)
Djangoly flags common sources of grief with model properties such as `CharField(null=True)` and omitting `related_name` for foreign keys.

### 2. Flag poor names and redundant queryset methods

![Djangoly name and redundant queryset method demo](https://raw.githubusercontent.com/software-trizzey/images/refs/heads/main/assets/images/djangoly-function-name-and-queryset-demo.gif)
Catch style issues like redundant queryset methods and function/variable names that don't match your conventions.


### 2. Test Suite Conventions

![Djangoly untested code demo](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/flag-untested-api-code.gif)
Djangoly reminds you to create and update test files when you modify your Django views or models.


![Djangoly test name validation](https://raw.githubusercontent.com/software-trizzey/images/refs/heads/main/assets/images/djangoly-test-name-validation.png)
Flag test names that don't match your team's preferences


### 3. Security Settings Check

![Djangoly test name validation](https://raw.githubusercontent.com/software-trizzey/images/refs/heads/main/assets/images/djangoly-settings-validation.png)
Djangoly identifies potential security risks in your Django settings and suggests safer alternatives.


### 4. Missing Exception Handling Detection

![Djangoly exception handler demo](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/djangoly-exception-handler-demo.gif)

Djangoly ensures that your Django views and methods have proper error handling. It flags functions that lack try-except blocks and can create exception handlers based on your preferences and the function's context.


## Quick Start 🏃‍♂️💨

1. **Get an API Key**: If you don't already have an API key, you can signup for one via this [form](https://forms.gle/gEEZdfhWpQyQh2qVA).
2. **Install the Extension**: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Alchemized.djangoly)
3. **Set Up Your Django Project**: If you haven't already, set up a Django project in your workspace.
4. **Configure Django Settings**: Open the extension settings in VS Code and configure your Django-specific settings.
5. **Start Coding**: Begin developing your Django project. The extension will automatically start analyzing your code.
6. **Review Suggestions**: Check the Problems panel in VS Code for Django best practice suggestions and quick fixes.

**Note**: To modify the extension rules, access these settings by going to `Preferences → Settings → Extensions → Djangoly`.


## Contributing

- Open a PR (see local development)
- Spotted a bug or have a feature request? Please create an issue.


## Known Issues & Limitations 🐞

- **False Positives**: As an MVP undergoing rapid development, Djangoly may generate inaccurate diagnostics and recommendations. If you encounter any issues, please report them to [support@djangoly.com](mailto:support@djangoly.com).


## License

This project is available under the [MIT License](LICENSE.md) except for the `premium` directory which is covered by a separate [license](server/bundled/tools/python/djangoly/premium/LICENSE.md).