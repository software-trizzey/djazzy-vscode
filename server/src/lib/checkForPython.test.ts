import { execSync } from 'child_process';
import * as path from 'path';
import { getVenvPythonExecutable, getGlobalPythonExecutable, isSupportedPythonVersion } from './checkForPython';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('checkForPython', () => {
  const execSyncMock = execSync as jest.Mock;

  beforeEach(() => {
    execSyncMock.mockReset();
  });

  describe('getVenvPythonExecutable', () => {
    it('should return the Python executable path if found in .venv', () => {
      const expectedPath = path.join(__dirname, '..', '..', '.venv', 'bin', 'python');
      execSyncMock.mockReturnValue('Python 3.9.1\n');

      const result = getVenvPythonExecutable();
      expect(result.executable).toBe(expectedPath);
      expect(result.error).toBeNull();
    });

    it('should return an error if Python version is below 3.9', () => {
      execSyncMock.mockReturnValue('Python 3.8.10\n');

      const result = getVenvPythonExecutable();
      expect(result.executable).toBeNull();
      expect(result.error).toContain('below the required 3.9');
    });

    it('should return an error if Python executable is not found in .venv', () => {
      execSyncMock.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = getVenvPythonExecutable();
      expect(result.executable).toBeNull();
      expect(result.error).toContain('Failed to find Python in .venv');
    });
  });

  describe('getGlobalPythonExecutable', () => {
    it('should return the global Python executable path if found', () => {
      const expectedCommand = 'python3';
      execSyncMock.mockReturnValue('Python 3.9.1\n');

      const result = getGlobalPythonExecutable();
      expect(result.executable).toBe(expectedCommand);
      expect(result.error).toBeNull();
    });

    it('should return an error if global Python version is below 3.9', () => {
      execSyncMock.mockReturnValue('Python 3.8.10\n');

      const result = getGlobalPythonExecutable();
      expect(result.executable).toBeNull();
      expect(result.error).toContain('below the required 3.9');
    });

    it('should return an error if global Python executable is not found', () => {
      execSyncMock.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = getGlobalPythonExecutable();
      expect(result.executable).toBeNull();
      expect(result.error).toContain('Failed to find global Python');
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