import { execSync } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';

export function checkForPythonAndVenv(): { pythonExecutable: string } | null {
    try {
        const hostPythonVersion = execSync('python --version || python3 --version', { encoding: 'utf-8' });
        console.log(`Python detected: ${hostPythonVersion.trim()}`);

		const isWindows = process.platform === 'win32';
        
        const extensionVenvPath = path.join(__dirname, '../bundled/tools/python/.venv');
        const pythonExecutable = path.join(extensionVenvPath, isWindows ? 'Scripts' : 'bin', 'python');

        if (existsSync(extensionVenvPath)) {
            console.log(`Bundled virtual environment found at ${extensionVenvPath}`);
            return { pythonExecutable };
        } else {
            console.error('Bundled virtual environment not found.');
            return null;
        }
    } catch (error) {
        console.error('Python is not installed or not found in PATH.');
        return null;
    }
}
