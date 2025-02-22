# Djazzy: Write Cleaner, Faster, Scalable Django Code

> **Heads up:** The project formerly known as "Djangoly" is now "Djazzy". This change was made to ensure compliance with the Django foundation's trademark policies, especially as we consider paid features. The new name, "Djazzy", pays homage to Django's namesake, the jazz musician Django Reinhardt, while incorporating the silent 'D' to maintain a connection to Django-specific code.

## What is Djazzy?

[Djazzy](https://djazzy.dev) is the open-source tool that helps Django developers write better code. It leverages static analysis and various IDE features to ensure your project aligns with Django best practices and conventions.

Djazzy helps you:

- Catch style violations like poor names and redundant queryset methods
- Remind you to create/update test files when you modify your Django views or models
- Identify potential security risks in your settings and suggest safer alternatives
- Ensure that your URLs follow the Django project's naming convention
- Automatically resolve migration conflicts (planned)
- Suggest valid field lookups (__gte, __in, etc.) when filtering QuerySets (planned)
- Autocomplete named URLs in reverse() and redirect() calls (planned)


## Djazzy highlights

### Flag annoyances such as `CharField(null=True)` omitting `related_name` for foreign keys etc.

![Djazzy model field demo](https://raw.githubusercontent.com/software-trizzey/images/refs/heads/main/assets/images/djangoly-model-field-validation-demo.gif)


### Catch style style violations like poor names and redundant queryset methods

![Djazzy name and redundant queryset method demo](https://raw.githubusercontent.com/software-trizzey/images/refs/heads/main/assets/images/djangoly-function-name-and-queryset-demo.gif)


### Reminds you to create/update test files when you modify your Django views or models.

![Djazzy untested code demo](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/flag-untested-api-code.gif)


### Flag test names that don't match your team's preferences

![Djazzy test name validation](https://raw.githubusercontent.com/software-trizzey/images/refs/heads/main/assets/images/djangoly-test-name-validation.png)


### Identifies potential security risks in your settings and suggests safer alternatives.

![Djazzy test name validation](https://raw.githubusercontent.com/software-trizzey/images/refs/heads/main/assets/images/djangoly-settings-validation.png)


### Ensures that your Django views and methods have proper error handling.

![Djazzy exception handler demo](https://raw.githubusercontent.com/software-trizzey/images/main/assets/images/djangoly-exception-handler-demo.gif)

 
## Docs

Djazzy implements a set of rules to help you write cleaner Django code. Each rule is designed to catch common pitfalls, enforce best practices, and improve the overall quality and security of your Django projects.

For a complete list of all rules, including detailed descriptions and examples, please refer to our [Convention Rules Documentation](https://github.com/software-trizzey/djazzy-vscode/blob/main/docs/CONVENTION_RULES.md).


## Known Issues & Limitations 🐞

- **False Positives**: Djazzy may generate inaccurate diagnostics and recommendations as an MVP undergoing rapid development. If you encounter any issues, please report them to [support@alchemizedsoftware.com](mailto:support@alchemizedsoftware.com).
