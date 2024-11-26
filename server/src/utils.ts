import * as fs from 'fs';
import * as path from 'path';


export function debounce<T extends (...args: any[]) => void>(
	func: T,
	timeout: number = 300
): (...args: Parameters<T>) => void {
	let timer: ReturnType<typeof setTimeout>;
	return (...args: Parameters<T>) => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			func(...args);
		}, timeout);
	};
}

const getPossibleTestPaths = (sourceUri: string): string[] => {
    const parsedPath = path.parse(sourceUri);
    let testPaths: string[] = [];

    switch (parsedPath.ext) {
        case '.js':
        case '.ts':
            testPaths = getJavaScriptTestPaths(parsedPath);
            break;
        case '.py':
            testPaths = getPythonTestPaths(parsedPath);
            break;
    }
    
    return testPaths;
};

const getJavaScriptTestPaths = (parsedPath: path.ParsedPath) => {
	if (/\/(tests|__tests__)\/.*/.test(parsedPath.dir)) {
		console.log("Already in tests directory", parsedPath);
		return [];
	}

    const testDirs = [
        parsedPath.dir,
        path.join(parsedPath.dir, '__tests__'),
        parsedPath.dir.replace(/(\/api\/|\/views\/)/, '/tests/')
    ];
    const testNames = [
        `${parsedPath.name}.test${parsedPath.ext}`,
        `${parsedPath.name}.spec${parsedPath.ext}`
    ];
    
    const testPaths = [];
    for (const testDir of testDirs) {
        for (const testName of testNames) {
            testPaths.push(path.join(testDir, testName));
        }
    }
    return testPaths;
};

const getPythonTestPaths = (parsedPath: path.ParsedPath) => {
	if (/\/tests\//.test(parsedPath.dir)) {
		console.log("Already in tests directory", parsedPath);
        return [];
    }

    const testDirs = [
        parsedPath.dir,
        path.join(parsedPath.dir, 'tests'),
        path.join(parsedPath.dir, '..', 'tests', parsedPath.dir.replace(/^.*\/(\w+)$/, '$1')),
        path.join(parsedPath.dir, '..', 'tests', 'views'),
        path.join(parsedPath.dir, '..', 'tests', 'api'),
        path.join(parsedPath.dir, '..', 'tests', path.basename(parsedPath.dir)),
		path.join(parsedPath.dir, '..', 'tests')
    ];

    const testNames = [
        `test_${parsedPath.name}${parsedPath.ext}`,
        `test_${parsedPath.name}s${parsedPath.ext}`,
        `${parsedPath.name}_tests${parsedPath.ext}`,
        `${parsedPath.name}s_tests${parsedPath.ext}`
    ];
    
    const testPaths = [];
    for (const testDir of testDirs) {
        for (const testName of testNames) {
            testPaths.push(path.join(testDir, testName));
        }
    }
    return testPaths;
};

export const checkForTestFile = async (uri: string): Promise<boolean> => {
    const testPaths = getPossibleTestPaths(uri);
    for (const testPath of testPaths) {
        try {
            await fs.promises.access(testPath, fs.constants.F_OK);
            return true;
        } catch {
			continue;
        }
    }
    return false;
};
