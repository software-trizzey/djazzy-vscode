import * as fs from 'fs';
import * as path from 'path';

import { Position, Range, RequestType } from "vscode-languageserver";
import { Connection } from "vscode-languageserver/node";

import { GET_CHANGED_LINES } from "./constants/commands";
import { RULE_MESSAGES } from './constants/rules';

import { actionWordsDictionary, commonWords } from "./data";
import { LanguageConventions } from "./languageConventions";
import { TextDocument } from 'vscode-languageserver-textdocument';

const cache = new Map<string, boolean>();

const CheckUncommittedChangesRequest = new RequestType<string, string, any>(
	GET_CHANGED_LINES
);

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

export async function checkDictionaryAPI(word: string): Promise<boolean> {
	if (cache.has(word)) {
		return !!cache.get(word);
	}
	try {
		const data = await fetchWithRetry(
			`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`,
			word
		);
		if (data && data.length > 0) {
			cache.set(word, true);
			return true;
		}
		cache.set(word, false);
		return false;
	} catch (error) {
		cache.set(word, false);
		return false;
	}
}

export function isLikelyBoolean(variableName: string): boolean {
	// TODO: add more patterns
	const likelyBooleanPatterns = [
		/^is[A-Z]/,
		/^has[A-Z]/,
		/^can[A-Z]/,
		/^should[A-Z]/,
		/^does[A-Z]/,
		/^is_[a-z]/,
		/^has_[a-z]/,
		/^can_[a-z]/,
		/^should_[a-z]/,
		/^does_[a-z]/,
	];
	return likelyBooleanPatterns.some((pattern) => pattern.test(variableName));
}

export function hasBooleanPrefix(
	variableName: string,
	prefixes: string[]
): boolean {
	return prefixes.some((prefix) => variableName.startsWith(prefix));
}

export function hasNegativePattern(variableName: string): boolean {
	// TODO: add more patterns
	const negativePatterns = [
		/Not[A-Z]/,
		/Never[A-Z]/,
		/No[A-Z]/,
		/not_[a-z]/,
		/never_[a-z]/,
		/no_[a-z]/,
	];
	return negativePatterns.some((pattern) => pattern.test(variableName));
}

/**
 * Check naming style (camelCase for JS/TS, snake_case for Python)
 */
export function validateVariableNameCase(
	name: string,
	languageId: string,
	isFunction = false
): boolean {
	let expectedPattern;

	if (isFunction) {
		if (languageId === "python") {
			expectedPattern = /^[a-z]+_[a-z0-9]+.*$/; // snake_case with at least two words
		} else {
			expectedPattern = /^[a-z]+[A-Z][a-z0-9]+.*$/; // camelCase with at least two uppercase words
		}
	} else {
		if (languageId === "python") {
			expectedPattern = /^[a-z]+(_[a-z0-9]+)*$/; // snake_case
		} else {
			expectedPattern = /^[a-z]+([A-Z][a-z0-9]+)*$/; // camelCase
		}
	}
	return expectedPattern.test(name);
}

export async function validateJavaScriptAndTypeScriptFunctionName(
    functionName: string,
    functionBodyLines: number,
    languageConventions: LanguageConventions
): Promise<{ violates: boolean; reason: string }> {
    const {
        expressiveNames: { functions },
    } = languageConventions;

	const functionNameWithoutUnderscorePrefix = functionName.startsWith("_") ? functionName.substring(1) : functionName;

    if (functions.avoidShortNames && functionNameWithoutUnderscorePrefix.length <= 3) {
        return {
            violates: true,
            reason: RULE_MESSAGES.FUNCTION_TOO_SHORT.replace("{name}", functionName),
        };
    }

    const actionWord = Object.keys(actionWordsDictionary).find((word) => functionNameWithoutUnderscorePrefix.startsWith(word));

    if (!actionWord) {
        return {
            violates: true,
            reason: RULE_MESSAGES.FUNCTION_NO_ACTION_WORD.replace("{name}", functionName),
        };
    }

    const nameWithoutActionWord = functionNameWithoutUnderscorePrefix.substring(actionWord.length);
    const words = await maxMatch(nameWithoutActionWord);

    if (words.length === 0) {
        return {
            violates: true,
            reason: RULE_MESSAGES.FUNCTION_MIN_TWO_WORDS.replace("{name}", functionName),
        };
    }

    if (functionBodyLines > functions.functionLengthLimit) {
        return {
            violates: true,
            reason: RULE_MESSAGES.FUNCTION_TOO_LONG.replace("{name}", functionName).replace("{limit}", functions.functionLengthLimit.toString()),
        };
    }

    return { violates: false, reason: "" };
}

export async function validatePythonFunctionName(
    functionName: string,
    functionBody: { content: string; bodyLength: number },
    languageConventions: LanguageConventions
): Promise<{ violates: boolean; reason: string }> {
    const {
        expressiveNames: { functions },
    } = languageConventions;

    if (functionName === "__init__" || functionName === "__main__") {
        return { violates: false, reason: "" };
    }

	const functionNameWithoutUnderscorePrefix = functionName.startsWith("_") ? functionName.substring(1) : functionName;

    if (functions.avoidShortNames && functionNameWithoutUnderscorePrefix.length < 3) {
        return {
            violates: true,
            reason: RULE_MESSAGES.FUNCTION_TOO_SHORT.replace("{name}", functionName),
        };
    }

    const actionWord = Object.keys(actionWordsDictionary).find((word) => 
        functionNameWithoutUnderscorePrefix.startsWith(word)
    );

    if (!actionWord) {
        return {
            violates: true,
            reason: RULE_MESSAGES.FUNCTION_NO_ACTION_WORD.replace("{name}", functionName),
        };
    }

    const nameWithoutActionWord = functionNameWithoutUnderscorePrefix.substring(actionWord.length);
    const words = await maxMatch(nameWithoutActionWord);

    if (words.length === 0) {
        return {
            violates: true,
            reason: RULE_MESSAGES.FUNCTION_MIN_TWO_WORDS.replace("{name}", functionName),
        };
    }

    if (functionBody.bodyLength > functions.functionLengthLimit) {
        return {
            violates: true,
            reason: RULE_MESSAGES.FUNCTION_TOO_LONG.replace("{name}", functionName).replace("{limit}", functions.functionLengthLimit.toString()),
        };
    }

    return { violates: false, reason: "" };
}

export async function getChangedLinesFromClient(
	connection: Connection,
	filePath: string
): Promise<Set<number>> {
	try {
		const uri = filePath;
		const changedLines = await connection.sendRequest(
			CheckUncommittedChangesRequest,
			uri
		);
		const parsedReseponse = JSON.parse(changedLines);
		const changedLinesSet = new Set<number>(parsedReseponse);
		return changedLinesSet;
	} catch (error) {
		console.error(error);
		throw error;
	}
}

async function fetchWithRetry(
	url: string,
	word: string,
	retries = 3,
	backoff = 300
) {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			if (response.status === 404) {
				console.warn(`"${word}" not found in dictionary API`);
				return [];
			} else if (response.status === 429 && retries > 0) {
				console.warn("Rate limit exceeded, retrying...");
				await new Promise((resolve) => setTimeout(resolve, backoff));
				return await fetchWithRetry(url, word, retries - 1, backoff * 2);
			}
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		return await response.json();
	} catch (error: any) {
		console.error("Failed to fetch: ", error.message);
		throw error;
	}
}

/**
 * Split a name into words based on camelCase and common separators
 * @returns
 */
function splitNameIntoWords(name: string): string[] {
	const tokens = name.split(/(?<=[a-z])(?=[A-Z])|[_-]/);
	return tokens;
}

async function validateWords(tokens: string[]) {
	const validWords = [];
	for (const token of tokens) {
		if (!token) continue;

		if (commonWords[token.toLowerCase()]) {
			validWords.push(token);
		} else if (await checkDictionaryAPI(token.toLowerCase())) {
			validWords.push(token);
		} else {
			console.warn("Invalid word: ", token);
			break;
		}
	}
	return validWords;
}

async function maxMatch(name: string): Promise<string[]> {
	const tokens = splitNameIntoWords(name);
	return await validateWords(tokens);
}

export function getWordRangeAt(document: TextDocument, position: Position) {
	const text = document.getText();
	const offset = document.offsetAt(position);
	let start = offset;
	let end = offset;
	while (start > 0 && /\w/.test(text.charAt(start - 1))) {
		start--;
	}
	while (end < text.length && /\w/.test(text.charAt(end))) {
		end++;
	}
	return Range.create(document.positionAt(start), document.positionAt(end));
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
