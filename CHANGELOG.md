# Changelog

All notable changes to this project will be documented in this file.

## [Version 0.1.11] - 2024-08-23

### Fixed

- [Bugfix] Fix issue where model field parsing logic didn't account for Django models that inherited from other models (not models.Model)


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