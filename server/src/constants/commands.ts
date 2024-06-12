const EXTENSION_ID = "whenInRome";

export const FIX_NAME = `${EXTENSION_ID}.fixNamingConvention`;
export const GET_CHANGED_LINES = `${EXTENSION_ID}.getGitDiff`;
export const CREATE_REPOSITORY = `${EXTENSION_ID}.createRepository`;
export const PROVIDE_RENAME_SUGGESTIONS = `${EXTENSION_ID}.provideRenameSuggestions`;
export const APPLY_RENAME_SYMBOL = `${EXTENSION_ID}.applyRenameSymbol`;
export const CHECK_TESTS_EXISTS = `${EXTENSION_ID}.checkTestExists`;
export const UPDATE_CACHED_USER_TOKEN = `${EXTENSION_ID}.updateCachedUserToken`;

const COMMANDS = { 
	FIX_NAME,
	GET_CHANGED_LINES,
	CREATE_REPOSITORY,
	PROVIDE_RENAME_SUGGESTIONS,
	APPLY_RENAME_SYMBOL,
	CHECK_TESTS_EXISTS,
	UPDATE_CACHED_USER_TOKEN
};

export const COMMANDS_LIST = Object.values(COMMANDS);

export default COMMANDS;
