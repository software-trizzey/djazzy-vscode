import { execSync } from 'child_process';

export function getPythonExecutableIfSupported(): string | null {
    try {
        const pythonExecutable = execSync('command -v python3 || command -v python', { encoding: 'utf-8' }).trim();
        const hostPythonVersionOutput = execSync(`${pythonExecutable} --version`, { encoding: 'utf-8' }).trim();
        const versionMatch = hostPythonVersionOutput.match(/Python (\d+\.\d+\.\d+)/);

        if (!versionMatch) {
            console.error('Unable to parse Python version:', hostPythonVersionOutput);
            return null;
        }

        const hostPythonVersion = versionMatch[1];
        console.log(`Python detected: ${hostPythonVersion}`);

        const [major, minor] = hostPythonVersion.split('.').map(Number);

        if (major < 3 || (major === 3 && minor < 9)) {
            console.error(`Python version ${hostPythonVersion} is below 3.9.`);
            return null;
        }

        return pythonExecutable;
    } catch (error) {
        console.error('Python is not installed or not found in PATH. Error:', error);
        return null;
    }
}
