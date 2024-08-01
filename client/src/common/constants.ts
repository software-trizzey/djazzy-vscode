export const EXTENSION_NAME = "djangoly";
export const EXTENSION_DISPLAY_NAME = "Djangoly";
export const EXTENSION_ID = "djangoly";
export const PUBLISHER = "alchemized";

export const SESSION_USER = `${EXTENSION_ID}User`;
export const SESSION_TOKEN_KEY = `${EXTENSION_ID}UserToken`;

export const COMMANDS = {
	SIGN_IN: `${EXTENSION_ID}.signIn`,
	SIGN_OUT: `${EXTENSION_ID}.signOut`,
	GET_GIT_DIFF: `${EXTENSION_ID}.getGitDiff`,
	CREATE_REPOSITORY: `${EXTENSION_ID}.createRepository`,
	RENAME_SYMBOL: `${EXTENSION_ID}.renameSymbol`,
	PROVIDE_RENAME_SUGGESTIONS: `${EXTENSION_ID}.provideRenameSuggestions`,
	APPLY_RENAME_SYMBOL: `${EXTENSION_ID}.applyRenameSymbol`,
	CHECK_TESTS_EXISTS: `${EXTENSION_ID}.checkTestExists`,
	ADD_CUSTOM_RULE: `${EXTENSION_ID}.addCustomRule`,
	OPEN_SETTINGS: `${EXTENSION_ID}.openSettings`,
	OPEN_WALKTHROUGH: `${EXTENSION_ID}.openWalkthrough`,
	UPDATE_CACHED_USER_TOKEN: `${EXTENSION_ID}.updateCachedUserToken`,
};


export const API_SERVER_URL = process.env.NODE_ENV === "development" ?  "http://localhost:8000" : "https://rome-django-auth.onrender.com";
