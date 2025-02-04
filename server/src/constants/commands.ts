import projectPackageJson from "../../package.json";

const EXTENSION_ID = "djangoly";

export const DJANGOLY_ID = projectPackageJson.publisher + "." + EXTENSION_ID;

export const FIX_NAME = `${EXTENSION_ID}.fixNamingConvention`;
export const GET_CHANGED_LINES = `${EXTENSION_ID}.getGitDiff`;
export const CREATE_REPOSITORY = `${EXTENSION_ID}.createRepository`;
export const CHECK_TESTS_EXISTS = `${EXTENSION_ID}.checkTestExists`;
export const UPDATE_CACHED_USER_TOKEN = `${EXTENSION_ID}.updateCachedUserToken`;
export const REPORT_FALSE_POSITIVE = `${EXTENSION_ID}.reportFalsePositive`;
export const PROVIDE_EXCEPTION_HANDLING = `${EXTENSION_ID}.provideExceptionHandling`;

export const RATE_LIMIT_NOTIFICATION_ID = `${EXTENSION_ID}/rateLimitReached`;
export const ACCESS_FORBIDDEN_NOTIFICATION_ID = `${EXTENSION_ID}/forbidden`;
export const NPLUSONE_FEEDBACK = `${EXTENSION_ID}.provideFeedbackNPlusOne`;

export const MIGRATION_COMMANDS = {
	CHECK_MIGRATIONS: 'djangoly.checkMigrations',
	APPLY_MIGRATIONS: 'djangoly.applyMigrations',
	DETECT_MAKEMIGRATIONS: 'djangoly.detectMakemigrations'
} as const;

const COMMANDS = { 
	FIX_NAME,
	GET_CHANGED_LINES,
	CREATE_REPOSITORY,
	CHECK_TESTS_EXISTS,
	UPDATE_CACHED_USER_TOKEN,
	REPORT_FALSE_POSITIVE,
	PROVIDE_EXCEPTION_HANDLING
};

export const COMMANDS_LIST = [
	...Object.values(COMMANDS),
	MIGRATION_COMMANDS.CHECK_MIGRATIONS,
	MIGRATION_COMMANDS.APPLY_MIGRATIONS,
	MIGRATION_COMMANDS.DETECT_MAKEMIGRATIONS
];

export default COMMANDS;
