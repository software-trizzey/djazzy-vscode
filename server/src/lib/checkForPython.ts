import { platform } from 'os';
import { execSync } from 'child_process';
import * as path from 'path';

interface PythonCheckResult {
    executable: string | null;
    error: string | null;
}

function isWindowsPlatform(): boolean {
    return platform() === 'win32';
}

function getVenvPythonExecutable(): PythonCheckResult {
    const venvPath = isWindowsPlatform()
        ? path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe')  // Windows
        : path.join(__dirname, '..', '..', '.venv', 'bin', 'python');  // Unix-based systems

    try {
        const versionOutput = execSync(`${venvPath} --version`, { encoding: 'utf-8' }).trim();
        const versionMatch = versionOutput.match(/Python (\d+\.\d+\.\d+)/);

        if (versionMatch) {
            const version = versionMatch[1];
            if (!isSupportedPythonVersion(version)) {
                return {
                    executable: null,
                    error: `Python version ${version} in .venv is below the required 3.9. Please ensure the correct Python version is used in the .venv.`,
                };
            }
            console.log(`Detected python ${version} in .venv`);
            return { executable: venvPath, error: null };
        } else {
            return { executable: null, error: `Unable to parse Python version from .venv output: "${versionOutput}".` };
        }
    } catch (error: any) {
        return { executable: null, error: `Failed to find Python in .venv. Ensure that the virtual environment is set up correctly. Error: ${error.message}` };
    }
}

function getGlobalPythonExecutable(): PythonCheckResult {
    const pythonCommand = isWindowsPlatform() ? 'python' : 'python3';

    try {
        const versionOutput = execSync(`${pythonCommand} --version`, { encoding: 'utf-8' }).trim();
        const versionMatch = versionOutput.match(/Python (\d+\.\d+\.\d+)/);

        if (versionMatch) {
            const version = versionMatch[1];
            if (!isSupportedPythonVersion(version)) {
                return {
                    executable: null,
                    error: `Global Python version ${version} is below the required 3.9. Please ensure the correct Python version is installed.`,
                };
            }
            console.log(`Detected global python ${version}`);
            return { executable: pythonCommand, error: null };
        } else {
            return { executable: null, error: `Unable to parse global Python version output: "${versionOutput}".` };
        }
    } catch (error: any) {
        return { executable: null, error: `Failed to find global Python. Ensure that Python is installed and added to your PATH. Error: ${error.message}` };
    }
}

function isSupportedPythonVersion(version: string): boolean {
    const [major, minor] = version.split('.').map(Number);
    return major > 3 || (major === 3 && minor >= 9);
}

/**
 * Returns the path to the Python executable if it is installed and supported,
 * otherwise returns an error message.
 * @returns PythonCheckResult
 */
export function getPythonExecutableIfSupported(): PythonCheckResult {
    let result = getVenvPythonExecutable();
    if (result.executable) {
        return result;
    }

    result = getGlobalPythonExecutable();
    if (result.executable) {
        return result;
    }

    return { executable: null, error: 'No suitable Python executable found. Please ensure Python 3.9 or higher is installed.' };
}