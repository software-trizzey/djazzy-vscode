# Changelog

All notable changes to this project will be documented in this file.

## [Version 0.2.4] - 2025-02-19

### Changed

- [Update] Rename extension to Djazzy. This rename ensure the extension respects the trademarked name "Django". We don't want to upset the folks at the Django foundation if choose to monetize the extension in the future.


## [Version 0.2.3] - 2025-02-11

### Changed

- [Update] Use session token for exception handling requests instead of API key.
- [Update] QOL changes around logging, telemetry, and client tests.
- [Bugfix] Fix issue where cached user sessions weren't cleared when signing out.

## [Version 0.2.3] - 2025-02-10

### Added

- [Feature] Allow legacy API key users to continue using the extension without being forced to sign in with Github. There will be a 30-day deprecation period for these users to migrate to the new sign-in process. We will prompt them to migrate when they open the extension. If they choose not to migrate, we will silence the reminder for 48 hours. It will then be shown again.

## [Version 0.2.3] - 2025-02-09

### Changed

- [Update] Update welcome message to include links to terms and privacy policy.
- [Update] Remove API key requirement in favor of user signup via Github OAuth. This will allow us to track usage and errors in a better way while also respecting user privacy.

## [Version 0.2.3] - 2025-02-05

### Changed

- [Update] Swapped rollbar for vscode telemetry to track extension usage. This will allow us to track usage and errors in a better way while also respecting user privacy.

- [Update] Update VS Code version requirement to 1.96.0 or higher.
- [Update] Update nvm to LTS version v22.13.1

## [Version 0.2.2] - 2024-12-03

### Added

- [Infra] Open-sourced this repo 🚀🎉

### Changed

- [Enhancement] Improved the project's README.md by updating its examples and streamlining the sections. Also added a new contributor section

## [Version 0.2.1] - 2024-11-27

### Changed

- [Enhancement] Refine how extension installtion and uninstallation events are logged.
- [Enhancement] Add check for global python executable if workspace version isn't found or extension version can't be used.

## [Version 0.2.0] - 2024-11-17

### Added

- [Feature] Update to djazzy v0.1.7 which supports better linter rule protections.

### Changed

- [Enhancement] Use enum list for linter rules in settings. This will ensure only valid rules are used.
- [Enhancement] Tidied project and refined logs.

### Removed

- [Removal] Removed uncustomizable settings: `onlyCheckNewCode`, `notificationInterval`, `nameLengthLimit`, `functionLengthLimit`


## [Version 0.2.0] - 2024-11-15

### Added

- [Feature] Update to djazzy v0.1.6 which includes new STY03 rule for test name enforcement.


## [Version 0.2.0] - 2024-10-03

### Changed

- [Enhancement] Refactor Django parsing and analysis files to standalone Djangoly package. 
- [Enhancement] Move python venv and .env files to project root.
- [Enhancement] Cleanup project files and unused functions.

### Removed

- [Removal] Remove Discord server links from readme while it's revamped


## [Version 0.1.18] - 2024-09-13

### Changed

- [Bugfix] Update secret key regexp to account for different 3rd party packages 
- [Enhancement] Show current boolean prefixes in the diagnostics message.
- [Bugfix] Link to Djangoly docs by default


## [Version 0.1.17] - 2024-09-13

### Removed

- [Removal] N+1 detection. Way too inconsistent. I think the only way to do this correctly will be with a fine-tuned model. But I'd only do that if there's sufficient demand. There's much easier features/long-hanging fruit to focus on.

### Changed

- [Bugfix] Addressed issue where variables within class methods weren't picked up by the linter.


## [Version 0.1.16] - 2024-09-12

### Added

- [Feature] Add rule CDQ14 that flags redundant queryset method chains like `all().filter()` or `all().count()`. 

### Changed

- [Enhancement] Update rule code list on node server and use them in diagnostics as source. Also updated readme to outline conventions section and point to complete list.
- [Enhancement] Updated add exception handler command to use the `Code boost` prefix. This will align with marketing material.
- [Enhancement] Skip N+1 analysis for certain files and non-django projects.

### Removed

- [Removal] Remove notifications for N+1 static analysis on file save. This was too annoying. I think we can use the status bar for this in a future update.


## [Version 0.1.15] - 2024-09-06

### Added

- [Feature] Reintroduce N+1 static query analysis. This feature identifies potential N+1 query patterns in Django code and suggests optimizations to minimize unnecessary database queries.
- [Feature] Add N+1 code action for feedback after static analysis to gather user input on whether suggestions were useful or not.

## [Version 0.1.14] - 2024-09-03

### Added

- [Feature] Add command that allows users to add exception handling to a selected function. The goal is to improve code quality by making the function more robust.
- [Feature] Enable API key access to track users and block API from abuse.
- [Feature] Create rule that flags Django functional/class-based views without exception handling.

### Changed

- [Enhancement] Refine python check. It now determines the current python version and whether python exists. Python versions +3.9 are supported.


## [Version 0.1.13] - 2024-08-27

### Removed

- [Removal] Removed support for N+1 static analysis. This was a tough decision but I found that the tool was creating too many false-positives and noise in the IDE. LLMs also aren't amazing at static analysis and I found that both the costs and latency were too much of an issue. Perhaps a private, fine-tuned model will be a better option in the future.


## [Version 0.1.12] - 2024-08-27

### Added

- [Feature] Rule: flag complex views and recommend refactoring them based on service or fat model design patterns.
- [Feature] Check whether python exists on host machine before starting extension.

### Changed

- [Enhancement] Refactored security checks to service class and added unit tests.
- [Enhancement] Refactored model field checks to service class and added unit tests.
- [Enhancement] Simplified PR template format.
- [Enhancement] Improve logger context and try to filter out errors from other sources (not Djangoly).

## [Version 0.1.11] - 2024-08-23

### Changed

- [Enhancement] Improve Python/Django parser logging. This will help us diagnose errors in prod.

### Fixed

- [Bugfix] Fix issue where model field parsing logic didn't account for Django models that inherited from other models (not models.Model). This update required that we cache model parents during the initial scan so that we could trace the inheritance chain through multiple files.

### Removed

- [Removal] Removed deprecated python scripts and unused requirements.txt
- [Removal] Minor log cleanup


## [Version 0.1.10] - 2024-08-23

### Added

- [Feature] Flag Django model foreign key fields that don't have `related_name=` set.
- [Feature] Flag Django model foreign key fields that don't have `on_delete=` set.
- [Feature] Flag Django model CharField and TextField fields that have set `null=True`
- [Feature] Avoid Direct Use of raw() and cursor() Queries (this check encourages safer code practices).

### Fixed

- [Bugfix] Fixed issue where for loop variables weren't carried over by our parser.

## [Version 0.1.9] - 2024-08-22

### Added

- [Enhancement] Add esbuild to bundle extension

### Fixed

- [Bugfix] Addressed `Request textDocument/codeAction failed.` where we were check for user token in codeAction flow. However, API key requirements were removed in version `0.1.8`


## [Version 0.1.8] - 2024-08-21

### Added

- [Enhancement] Track activation/deactivation events using Rollbar

### Removed

- [Removal] Remove API key and extension auth requirement to streamline onboarding.

## [Version 0.1.7] - 2024-08-21

### Added

- [Feature] Add Django model scanner that will find and cache the current project's model definitions.
- [Enhancement] Use cached model data to improve accuracy of related field detection for N+1 analysis.

### Changed

- [Update] Refined N+1 analysis class for better handling of pre-optimized querysets.
- [Update] Reduce scoring system thresholds so that high severity errors are harder to hit. Issues with error levels will likely block teams using pre-commit git hooks so we want to be thoughtful here.

### Changed

- [Update] Refactored project structure and broke language provider class into smaller focused service classes.

## [Version 0.1.6] - 2024-08-12

### Changed

- [Update] Update the logic of N+1 query detector to consider related fields and levels when reviewing potential issues.


### Added

- [Enhancement] Added a limitations section to `README.md` to inform users that the N+1 query detector method can create false positives right now.


## [Version 0.1.5] - 2024-08-11

### Changed

- [Feature] Refactor N+1 query detection to use static analysis classes instead of LLM calls.


## [Version 0.1.4] - 2024-08-10

### Changed

- [Update] Updated `README.md` sections and added beta program signup form.

## [Version 0.1.3] - 2024-08-09

### Added

- [Feature] Reactivate rename suggestions (code actions) for function names.

## [Version 0.1.2] - 2024-08-08

### Added

- [Enhancement] Add additional security checks (CSRF_COOKIE_SECURE, SESSION_COOKIE_SECURE)
- [Enhancement] Include links to relevant Django documentation for security check symbol.

## [Version 0.1.1] - 2024-08-08

### Added

- [Feature] Detect misconfigured security settings in Django settings file. (Debug, Secret key, and Allowed Hosts)


## [Version 0.1.0] - 2024-08-02

### Added

- [Feature] Add N+1 query detection with scoring for different levels.

### Removed

- [Removal] Import project from When In Rome and removed features and files unreleated to the Djangoly MVP (JS/TS support, rename suggestions and custom command for symbols)