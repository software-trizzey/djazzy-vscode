import * as path from 'path';


export function getParserFilePath(filename: string = 'run_check.py'): string {
    const basePath = path.resolve(
        __dirname, '..', 'bundled', 'tools', 'python'
    );
    const parserFilePath = path.join(basePath, filename);

    console.log(`Resolved parser file path: ${parserFilePath}`);

    return parserFilePath;
}