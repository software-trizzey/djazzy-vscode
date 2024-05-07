import { RequestType } from "vscode-languageserver";
import { Connection } from "vscode-languageserver/node";

import { GET_CHANGED_LINES } from "./constants/commands";
import { actionWordsDictionary, commonWords } from "./data";

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

export function containsAbbreviation(name: string): boolean {
	const commonAbbreviations = [
		"id",
		"info",
		"num",
		"qty",
		"calc",
		"tmp",
		"cfg",
		"msg",
	];
	const wordBoundaryRegex = new RegExp(
		`\\b(${commonAbbreviations.join("|")})\\b`,
		"i"
	);
	return wordBoundaryRegex.test(name);

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

export async function validateJavaScriptAndTypeScriptFunctionNameCase(
	functionName: string
): Promise<{ violates: boolean; reason: string }> {
	const actionWord = Object.keys(actionWordsDictionary).find((word) => {
		const functionNameWithoutUnderscorePrefix = functionName.startsWith("_")
			? functionName.substring(1)
			: functionName;
		const result = functionNameWithoutUnderscorePrefix.startsWith(word);
		return result;
	});
	if (!actionWord) {
		return {
			violates: true,
			reason: `Function "${functionName}" does not start with a recognized action word.`,
		};
	}

	const nameWithoutActionWord = functionName.substring(actionWord.length);
	const words = await maxMatch(nameWithoutActionWord);

	if (words.length === 0) {
		return {
			violates: true,
			reason: `Function "${functionName}" must contain at least two words, e.g., 'getWeather'.`,
		};
	}

	/**
	 * FIXME: deactivate camelCase validation for now. We can use eslint for this
	 * else if (words.length >= 1) {
		for (let i = 0; i < words.length; i++) {
			if (!/^[A-Z]/.test(words[i])) {
				return {
					violates: true,
					reason: `Function "${functionName}" violates "camelCase" convention. Each word after the action prefix, must start with an uppercase letter (e.g. "getWeatherData").`,
				};
			}
		}
	}
	 * 
	 */

	return { violates: false, reason: "" };
}

export async function validatePythonFunctionName(
	functionName: string
): Promise<{
	violates: boolean;
	reason: string;
}> {
	if (functionName === "__init__" || functionName === "__main__") {
		return { violates: false, reason: "" };
	}

	const actionWord = Object.keys(actionWordsDictionary).find((word) => {
		const functionNameWithoutUnderscorePrefix = functionName.startsWith("_")
			? functionName.substring(1)
			: functionName;
		const result = functionNameWithoutUnderscorePrefix.startsWith(word);
		return result;
	});
	if (!actionWord) {
		return {
			violates: true,
			reason: `Function "${functionName}" does not start with a recognized action word.`,
		};
	}

	const nameWithoutActionWord = functionName.substring(actionWord.length);
	const words = await maxMatch(nameWithoutActionWord);

	if (words.length === 0) {
		return {
			violates: true,
			reason: `Function "${functionName}" must contain at least two words, e.g., 'get_snacks'.`,
		};
	}

	/**
	 * FIXME: deactivate snake_case validation for now. We can use pylint or ruff for this
	 * else if (words.length >= 1) {
		for (let i = 0; i < words.length; i++) {
			if (!/^[a-z_][a-z0-9_]*$/.test(words[i])) {
				return {
					violates: true,
					reason: `Function "${functionName}" violates "snake_case" convention. Each segment must start with a lowercase letter or underscore, followed by any combination of lowercase letters, numbers, or underscores (e.g., "get_weather_data", "parse_xml2json").`,
				};
			}
		}
	}
	 * 
	 */

	return { violates: false, reason: "" };
}

export async function maxMatch(name: string): Promise<string[]> {
	if (name === "") return [];

	for (let i = name.length; i > 0; i--) {
		const candidateWord = name.substring(0, i);
		if (
			commonWords[candidateWord.toLowerCase()] ||
			(await checkDictionaryAPI(candidateWord.toLowerCase()))
		) {
			return [candidateWord].concat(await maxMatch(name.substring(i)));
		}
	}
	// When no matching initial segment is found, we consider the first character as a word
	// This is a fallback and might not be ideal for all use cases
	return [name[0]].concat(await maxMatch(name.substring(1)));
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
