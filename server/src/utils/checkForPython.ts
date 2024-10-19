import { execSync } from 'child_process';
import * as path from 'path';
import { platform } from 'os';

interface PythonCheckResult {
    executable: string | null;
    error: string | null;
}

function isWindowsPlatform(): boolean {
    return platform() === 'win32';
}

function getVenvPythonExecutable(): PythonCheckResult {
    // Define the path to the Python executable inside the .venv based on the OS
    const venvPath = isWindowsPlatform()
        ? path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe')  // Windows
        : path.join(__dirname, '..', '..', '.venv', 'bin', 'python');         // macOS/Linux

    try {
        // Check if the .venv Python exists and is working by checking its version
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
            console.log(`Using Python from .venv: ${version}`);
            return { executable: venvPath, error: null };
        } else {
            return { executable: null, error: `Unable to parse Python version from .venv output: "${versionOutput}".` };
        }
    } catch (error: any) {
        return { executable: null, error: `Failed to find Python in .venv. Ensure that the virtual environment is set up correctly. Error: ${error.message}` };
    }
}

function isSupportedPythonVersion(version: string): boolean {
    const [major, minor] = version.split('.').map(Number);
    return major > 3 || (major === 3 && minor >= 9);
}

/**
 * Returns the path to the Python executable in the shipped .venv if it is installed and supported,
 * otherwise returns an error message.
 * @returns PythonCheckResult
 */
export function getPythonExecutableIfSupported(): PythonCheckResult {
    return getVenvPythonExecutable();
}
