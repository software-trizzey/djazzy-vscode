import * as path from 'path';

export function getRustBinaryPath(): string {
	const basePath = path.resolve(
		__dirname, '..', 'bundled', 'tools', 'djazzy_rust',
	);

	return path.join(basePath, 'target', 'release', 'djazzy_rust');
}

