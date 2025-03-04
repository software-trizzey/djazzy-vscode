import projectPackageJson from "../../package.json";

export const EXTENSION_NAME = "djazzy";
export const EXTENSION_DISPLAY_NAME = "Djazzy";
export const EXTENSION_ID = "djazzy";
export const PUBLISHER = "alchemized";

export const DJANGOLY_ID = projectPackageJson.publisher + "." + EXTENSION_ID;

export const SESSION_USER = `${EXTENSION_ID}User`;
export const SESSION_TOKEN_KEY = `${EXTENSION_ID}UserToken`;

export const COMMANDS = {
	SIGN_IN: `${EXTENSION_ID}.signIn`,
	SIGN_OUT: `${EXTENSION_ID}.signOut`,
	GET_GIT_DIFF: `${EXTENSION_ID}.getGitDiff`,
	CREATE_REPOSITORY: `${EXTENSION_ID}.createRepository`,
	CHECK_TESTS_EXISTS: `${EXTENSION_ID}.checkTestExists`,
	ADD_CUSTOM_RULE: `${EXTENSION_ID}.addCustomRule`,
	OPEN_SETTINGS: `${EXTENSION_ID}.openSettings`,
	OPEN_WALKTHROUGH: `${EXTENSION_ID}.openWalkthrough`,
	UPDATE_CACHED_USER_TOKEN: `${EXTENSION_ID}.updateCachedUserToken`,
	USER_API_KEY: `${EXTENSION_ID}.apiKey`,
	REMOVE_API_KEY: `${EXTENSION_ID}.removeApiKey`,
	GET_API_KEY: `${EXTENSION_ID}.getApiKey`,
	PROVIDE_EXCEPTION_HANDLING: `${EXTENSION_ID}.provideExceptionHandling`,
	ANALYZE_EXCEPTION_HANDLING: `${EXTENSION_ID}.analyzeExceptionHandling`,
	PREVIEW_AND_APPLY_SUGGESTION: `${EXTENSION_ID}.previewAndApplySuggestion`,
	NPLUSONE_FEEDBACK: `${EXTENSION_ID}.provideFeedbackNPlusOne`,
};

export const RATE_LIMIT_NOTIFICATION_ID = `${EXTENSION_ID}/rateLimitReached`;
export const ACCESS_FORBIDDEN_NOTIFICATION_ID = `${EXTENSION_ID}/forbidden`;

export const API_SERVER_URL = process.env.NODE_ENV === "development" ?  "http://localhost:8000" : "https://djazzy-api.onrender.com";

export const API_KEY_SIGNUP_URL = "https://forms.gle/gEEZdfhWpQyQh2qVA";


export const MIGRATION_REMINDER = {
    LAST_PROMPTED_KEY: 'migrationLastPrompted',
    COOLDOWN_HOURS: 48
}; 