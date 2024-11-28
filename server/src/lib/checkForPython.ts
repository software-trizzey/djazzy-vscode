import { platform } from 'os';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface PythonCheckResult {
    executable: string | null;
    error: string | null;
}

function isWindowsPlatform(): boolean {
    return platform() === 'win32';
}


export function isSupportedPythonVersion(version: string): boolean {
    const [major, minor] = version.split('.').map(Number);
    return major > 3 || (major === 3 && minor >= 9);
}

function checkPythonExecutable(pythonPath: string): PythonCheckResult {
    try {
        const versionOutput = execSync(`${pythonPath} --version`, { encoding: 'utf-8' }).trim();
        const versionMatch = versionOutput.match(/Python (\d+\.\d+\.\d+)/);

        if (versionMatch) {
            const version = versionMatch[1];
            if (!isSupportedPythonVersion(version)) {
                return {
                    executable: null,
                    error: `Python version ${version} is below the required 3.9. Please ensure the correct Python version is used.`,
                };
            }
            console.log(`Detected python version ${version}`);
            return { executable: pythonPath, error: null };
        } else {
            return { executable: null, error: `Unable to parse Python version from output: "${versionOutput}".` };
        }
    } catch (error: any) {
        return { executable: null, error: `Failed to find Python at ${pythonPath}. Error: ${error.message}` };
    }
}

export function getPythonExecutable(projectRoot: string): PythonCheckResult {
    const commonVenvPaths = [
        isWindowsPlatform() ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe') : path.join(projectRoot, '.venv', 'bin', 'python'),
        isWindowsPlatform() ? path.join(projectRoot, 'venv', 'Scripts', 'python.exe') : path.join(projectRoot, 'venv', 'bin', 'python'),
        isWindowsPlatform() ? path.join(projectRoot, 'env', 'Scripts', 'python.exe') : path.join(projectRoot, 'env', 'bin', 'python'),
    ];

    for (const pythonPath of commonVenvPaths) {
        if (fs.existsSync(pythonPath)) {
            const result = checkPythonExecutable(pythonPath);
            if (result.executable) {
                return result;
            }
        }
    }

    const pythonCommand = isWindowsPlatform() ? 'python' : 'python3';
    return checkPythonExecutable(pythonCommand);
}