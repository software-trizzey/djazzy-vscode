import { execSync } from 'child_process';
import { platform } from 'os';

interface PythonCheckResult {
    executable: string | null;
    error: string | null;
}

function isWindowsPlatform(): boolean {
    return platform() === 'win32';
}

function findPythonExecutable(): PythonCheckResult {
    try {
        let pythonExecutable: string;

        if (isWindowsPlatform()) {
            pythonExecutable = execSync('where python', { encoding: 'utf-8' }).split('\n')[0].trim();
        } else {
            pythonExecutable = execSync('command -v python3 || command -v python', { encoding: 'utf-8' }).trim();
        }

        if (!pythonExecutable) {
            return { executable: null, error: 'Python executable not found. Ensure that Python 3.9 or higher is installed and available in your PATH.' };
        }

        return { executable: pythonExecutable, error: null };
    } catch (error) {
        return { executable: null, error: 'Failed to find Python executable. Ensure that Python 3.9 or higher is installed and available in your PATH.' };
    }
}

function getPythonVersion(pythonExecutable: string): PythonCheckResult {
    try {
        const versionOutput = execSync(`${pythonExecutable} --version`, { encoding: 'utf-8' }).trim();
        const versionMatch = versionOutput.match(/Python (\d+\.\d+\.\d+)/);
        if (versionMatch) {
            return { executable: versionMatch[1], error: null };
        } else {
            return { executable: null, error: `Unable to parse Python version from output: "${versionOutput}".` };
        }
    } catch (error: any) {
        return {
            executable: null,
            error: `Failed to retrieve Python version from executable: ${pythonExecutable}. Error: ${error.message}`
        };
    }
}

function isSupportedPythonVersion(version: string): boolean {
    const [major, minor] = version.split('.').map(Number);
    return major > 3 || (major === 3 && minor >= 9);
}

/**
 * Returns the path to the Python executable if it is installed and supported, otherwise returns an error message.
 * @returns PythonCheckResult
 */
export function getPythonExecutableIfSupported(): PythonCheckResult {
    const pythonExecutableResult = findPythonExecutable();
    if (pythonExecutableResult.error) {
        return { executable: null, error: pythonExecutableResult.error };
    }

    const pythonVersionResult = getPythonVersion(pythonExecutableResult.executable!);
    if (pythonVersionResult.error) {
        return { executable: null, error: pythonVersionResult.error };
    }

    console.log(`Python detected: ${pythonVersionResult.executable}`);

    if (!isSupportedPythonVersion(pythonVersionResult.executable!)) {
        return {
            executable: null,
            error: `Detected Python version ${pythonVersionResult.executable} is below the required 3.9. Please upgrade your Python installation.`,
        };
    }

    return { executable: pythonExecutableResult.executable, error: null };
}
