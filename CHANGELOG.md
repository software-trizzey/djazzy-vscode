```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- [Feature] Brief description of the new feature.
- [Enhancement] Brief description of the enhancement.

### Changed

- [Update] Brief description of the update.

### Fixed

- [Bugfix] Brief description of the bug fix.

### Removed

- [Removal] Brief description of what was removed.

## [Version 0.0.26] - 2024-06-06

### Changed

- [Update] Instruct LLM to use one of the approved verbs when suggesting function names.

### Fixed

- [Bugfix] First pass at reducing syntax-related errors in rollbar. We simply skip logging the ones we catch and log others to the server console for improved debugging.


## [Version 0.0.25] - 2024-06-05

### Changed

- [Update] Improved handling of incomplete user-typed code to avoid crashes in the parser.

### Fixed

- [Bugfix] Resolved an issue where resolved warnings would still appear in the UI.
- [Bugfix] Addressed caching issues that caused outdated diagnostics to persist.

### Removed

- [Removal] Eliminated redundant error handling in the parser to simplify codebase.

## [Version 0.0.24] - 2024-06-04

### Added

- [Feature] Added support for rename symbol flow that includes rename suggestions.
- [Feature] Implemented a file watcher for API and views folders to ensure test files exist for updated files.
- [Feature] Added support for custom test file paths in extension settings.

### Changed

- [Update] Improved error handling in Python/Django parser to gracefully handle syntax errors.
- [Update] Refactored `checkAndNotify` function to better handle new file changes in Git diff.

### Fixed

- [Bugfix] Fixed an issue where Django-specific methods were not flagged as reserved.
- [Bugfix] Corrected the `getPythonTestPaths` function to properly match test files in nested structures.

### Removed

- [Removal] Removed unnecessary file path checks that were redundant.
```
