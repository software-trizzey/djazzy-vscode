import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getPythonExecutable, isSupportedPythonVersion } from './checkForPython';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

describe('checkForPython', () => {
  const execSyncMock = execSync as jest.Mock;
  const existsSyncMock = fs.existsSync as jest.Mock;

  beforeEach(() => {
    execSyncMock.mockReset();
    existsSyncMock.mockReset();
  });

  describe('getPythonExecutable', () => {
    const projectRoot = path.resolve(__dirname, '..', '..');

    it('should return the Python executable path if found in .venv', () => {
      const expectedPath = path.join(projectRoot, '.venv', 'bin', 'python');
      existsSyncMock.mockReturnValueOnce(true);
      execSyncMock.mockReturnValue('Python 3.9.1\n');

      const result = getPythonExecutable(projectRoot);
      expect(result.executable).toBe(expectedPath);
      expect(result.error).toBeNull();
    });

    it('should return an error if Python version in .venv is below 3.9', () => {
      const expectedPath = path.join(projectRoot, '.venv', 'bin', 'python');
      existsSyncMock.mockReturnValueOnce(true);
      execSyncMock.mockReturnValue('Python 3.8.10\n');

      const result = getPythonExecutable(projectRoot);
      expect(result.executable).toBeNull();
      expect(result.error).toContain('below the required 3.9');
    });

    it('should return the global Python executable path if no .venv is found', () => {
      existsSyncMock.mockReturnValue(false);
      const expectedCommand = 'python3';
      execSyncMock.mockReturnValue('Python 3.9.1\n');

      const result = getPythonExecutable(projectRoot);
      expect(result.executable).toBe(expectedCommand);
      expect(result.error).toBeNull();
    });

    it('should return an error if global Python version is below 3.9', () => {
      existsSyncMock.mockReturnValue(false);
      execSyncMock.mockReturnValue('Python 3.8.10\n');

      const result = getPythonExecutable(projectRoot);
      expect(result.executable).toBeNull();
      expect(result.error).toContain('below the required 3.9');
    });

    it('should return an error if no Python executable is found', () => {
      existsSyncMock.mockReturnValue(false);
      execSyncMock.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = getPythonExecutable(projectRoot);
      expect(result.executable).toBeNull();
      expect(result.error).toContain('Failed to find Python');
    });
  });

  describe('isSupportedPythonVersion', () => {
    it('should return true for supported Python versions', () => {
      expect(isSupportedPythonVersion('3.9.1')).toBe(true);
      expect(isSupportedPythonVersion('3.10.0')).toBe(true);
    });

    it('should return false for unsupported Python versions', () => {
      expect(isSupportedPythonVersion('3.8.10')).toBe(false);
      expect(isSupportedPythonVersion('2.7.18')).toBe(false);
    });
  });
});