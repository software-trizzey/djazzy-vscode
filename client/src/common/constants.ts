export const EXTENSION_NAME = "When In Rome";
export const EXTENSION_ID = "whenInRome";

export const SESSION_USER = `${EXTENSION_ID}User`;
export const SESSION_TOKEN_KEY = `${EXTENSION_ID}UserToken`;

export const COMMANDS = {
	SIGN_IN: `${EXTENSION_ID}.signIn`,
	SIGN_OUT: `${EXTENSION_ID}.signOut`,
	GET_GIT_DIFF: `${EXTENSION_ID}.getGitDiff`,
	CREATE_REPOSITORY: `${EXTENSION_ID}.createRepository`,
	RENAME_SYMBOL: `${EXTENSION_ID}.renameSymbol`,
	PROVIDE_RENAME_SUGGESTIONS: `${EXTENSION_ID}.provideRenameSuggestions`,
	APPLY_RENAME_SYMBOL: `${EXTENSION_ID}.applyRenameSymbol`
};

export const AUTH_SERVER_URL = "https://rome-django-auth.onrender.com";
// TODO: this is jank but NODE_ENV isn't working when the app is packaged and I need to ship
// export const AUTH_SERVER_URL = "http://127.0.0.1:8000";
