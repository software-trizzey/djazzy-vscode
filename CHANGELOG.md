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

## [Version 0.0.24] - 2024-06-04

### Added

- [Feature] Added support for rename symbol flow that includes rename suggestions.
- [Feature] Implemented a file watcher for API and views folders to ensure test files exist for updated files.
- [Feature] Added support for custom test file paths in extension settings.

### Changed

- [Update] Improved error handling in Python/Django parser to gracefully handle syntax errors.
- [Update] Refactored `checkAndNotify` function to better handle new file changes in Git diff.
- [Update] Enhanced rename symbol function to find references in other files.

### Fixed

- [Bugfix] Fixed an issue where Django-specific methods were not flagged as reserved.
- [Bugfix] Corrected the `getPythonTestPaths` function to properly match test files in nested structures.

### Removed

- [Removal] Removed unnecessary file path checks that were redundant.
