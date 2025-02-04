import * as vscode from 'vscode';
import { platform } from 'os';
import * as fs from 'fs';
import * as path from 'path';


export interface PythonCheckResult {
    executable: string | null;
    error: string | null;
}

export function isWindowsPlatform(): boolean {
    return platform() === 'win32';
}

export function getPythonExecutable(projectRoot: string): PythonCheckResult {
    const commonVenvPaths = [
        isWindowsPlatform() ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe') : path.join(projectRoot, '.venv', 'bin', 'python'),
        isWindowsPlatform() ? path.join(projectRoot, 'venv', 'Scripts', 'python.exe') : path.join(projectRoot, 'venv', 'bin', 'python'),
        isWindowsPlatform() ? path.join(projectRoot, 'env', 'Scripts', 'python.exe') : path.join(projectRoot, 'env', 'bin', 'python'),
    ];

    for (const pythonPath of commonVenvPaths) {
        if (fs.existsSync(pythonPath)) {
            return { executable: pythonPath, error: null };
        }
    }

    return { executable: null, error: 'No Python environment found' };
} 

export async function findVirtualEnvPath(workspaceRoot: string): Promise<string | undefined> {
    if (fs.existsSync(path.join(workspaceRoot, 'poetry.lock'))) {
        return 'poetry run';
    }

    const pythonResult = getPythonExecutable(workspaceRoot);
    if (pythonResult.error) {
        const createVenvText = 'Create Virtual Environment';
        const response = await vscode.window.showWarningMessage(
            'No Python virtual environment found. Would you like to create one?',
            createVenvText,
            'Dismiss'
        );

        if (response === createVenvText) {
            const terminal = vscode.window.createTerminal('Python Environment');
            terminal.show();
            terminal.sendText(`cd "${workspaceRoot}"`);
            terminal.sendText('python -m venv .venv');
            return isWindowsPlatform() 
                ? `.venv\\Scripts\\activate.bat`
                : 'source .venv/bin/activate';
        }
        return undefined;
    }

    // If we found a Python executable, construct the appropriate activate command
    const venvPath = pythonResult.executable!.replace(
        isWindowsPlatform() ? 'python.exe' : 'python',
        isWindowsPlatform() ? 'activate.bat' : 'activate'
    );
    
    return isWindowsPlatform()
        ? venvPath
        : `source ${venvPath}`;
} 