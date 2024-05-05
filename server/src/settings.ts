export interface ExtensionSettings {
	isJavascriptEnabled: boolean;
	isTypescriptEnabled: boolean;
	isPythonEnabled: boolean;
	onlyCheckNewCode: boolean;
	isDevMode: boolean;
}

export const defaultSettings: ExtensionSettings = {
	isJavascriptEnabled: true,
	isTypescriptEnabled: true,
	isPythonEnabled: true,
	onlyCheckNewCode: false,
	isDevMode: false,
};
