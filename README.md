# Djangoly: Write Cleaner, Faster, Scalable Django Code

Djangoly is an extension built for Django developers that works with both [VS Code](https://code.visualstudio.com/) and [Cursor IDE](https://www.cursor.com/). It uses static analysis to ensure your project aligns with Django best practices and conventions. You can install the extension via the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Alchemized.djangoly) or by searching for `djangoly` in your IDE's extension tab.

> Note: Djangoly requires _Python 3.9_ or higher to function properly. Please ensure your environment meets this requirement before using the extension.


## Get started for free

Djangoly is open source, and you are free to fork and host your own version of the extension. We encourage contributions and feedback from the community.

However, for the best experience and to access support, we recommend using the [official VS Code extension](https://marketplace.visualstudio.com/items?itemName=Alchemized.djangoly). In the future, we plan to introduce paid features to support the ongoing development and maintenance of the extension.


## Docs

Djangoly implements a comprehensive set of rules to help you write cleaner, safer, and more efficient Django code. Each rule is designed to catch common pitfalls, enforce best practices, and improve the overall quality and security of your Django projects.

For a complete list of all rules, including detailed descriptions and examples, please refer to our [Convention Rules Documentation](https://github.com/software-trizzey/djangoly-vscode/blob/main/docs/CONVENTION_RULES.md).


## Djangoly highlights

### 1. Flag annoyances such as `CharField(null=True)` omitting `related_name` for foreign keys etc.

![Djangoly model field demo](https://raw.githubusercontent.com/software-trizzey/images/refs/heads/main/assets/images/djangoly-model-field-validation-demo.gif)


### 2. Catch style style violations like poor names and redundant queryset methods

![Djangoly name and redundant queryset method demo](https://raw.githubusercontent.com/software-trizzey/images/refs/heads/main/assets/images/djangoly-function-name-and-queryset-demo.gif)


### 3. Reminds you to create/update test files when you modify your Django views or models.

![Djangoly untested code demo](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/flag-untested-api-code.gif)


### 4. Flag test names that don't match your team's preferences
![Djangoly test name validation](https://raw.githubusercontent.com/software-trizzey/images/refs/heads/main/assets/images/djangoly-test-name-validation.png)


### 5. Identifies potential security risks in your settings and suggests safer alternatives.

![Djangoly test name validation](https://raw.githubusercontent.com/software-trizzey/images/refs/heads/main/assets/images/djangoly-settings-validation.png)


### 6. Ensures that your Django views and methods have proper error handling.

![Djangoly exception handler demo](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/djangoly-exception-handler-demo.gif)



## Quick Start 🏃‍♂️💨

1. **Install the Extension**: Get Djangoly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Alchemized.djangoly) or install directly in Cursor IDE
2. **Sign in with GitHub**: When you first use the extension, you'll be prompted to authenticate with your GitHub account
3. **Set Up Your Django Project**: If you haven't already, set up a Django project in your workspace
4. **Start Coding**: Begin developing your Django project. The extension will automatically start analyzing your code
5. **Review Suggestions**: Check the Problems panel in your IDE for Django best practice suggestions and quick fixes

> Note for existing users: If you use an API key, you'll have 30 days to migrate to GitHub authentication. The extension will guide you through this process.

To modify the extension rules, access these settings by going to `Preferences → Settings → Extensions → Djangoly` in either VS Code or Cursor.


## Contributing

- Open a PR (see local development)
- Spotted a bug or have a feature request? Please create an issue.


## Known Issues & Limitations 🐞

- **False Positives**: Djangoly may generate inaccurate diagnostics and recommendations as an MVP undergoing rapid development. If you encounter any issues, please report them to [support@djangoly.com](mailto:support@djangoly.com).


## License

This project is available under the [MIT License](LICENSE.md) except for the `premium` directory, which is covered by a separate [license](server/bundled/tools/python/djangoly/premium/LICENSE.md).
