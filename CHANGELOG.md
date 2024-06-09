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

## [Version 0.0.30] - 2024-06-09

### Added

- [Feature] Add support for validating object key names. Current rules are focused on expressiveness.

## [Version 0.0.29] - 2024-06-08

### Changed

- [Update] Streamline client activate function by moving file watcher setup to `client/src/common/utils/fileWatchers.ts`

### Fixed

- [Bugfix] Newly created view files weren't picked up by the file watcher


## [Version 0.0.28] - 2024-06-06

### Added

- [Feature] Add MVP walkthrough steps for users that have first installed the extension
- [Enhancement] Streamline client activate function by moving command registration logic to separate file

### Changed

- [Update] Changed name of custom rename symbol from `Rename Symbol (When In Rome)` -> `Align Symbol With Conventions (When In Rome)`
- [Update] Changed grouping of `Align Symbol With Conventions (When In Rome)` to code modification section of context menu. It's now closer to rename


## [Version 0.0.27] - 2024-06-06

### Changed

- [Update] Add TODO comments for future rule improvements

### Fixed

- [Bugfix] Update function and variable name rule to flag names 3 characters or less.


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
