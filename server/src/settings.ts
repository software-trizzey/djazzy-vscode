export interface ExtensionSettings {
	maxNumberOfProblems: number;
	isJavascriptEnabled: boolean;
	isTypescriptEnabled: boolean;
	isPythonEnabled: boolean;
	onlyCheckNewCode: boolean;
	mockFetchSuggestedName: boolean;
	isDevMode: boolean;
}

export const defaultSettings: ExtensionSettings = {
	maxNumberOfProblems: 1000,
	isJavascriptEnabled: true,
	isTypescriptEnabled: true,
	isPythonEnabled: true,
	onlyCheckNewCode: false,
	mockFetchSuggestedName: true,
	isDevMode: false,
};
