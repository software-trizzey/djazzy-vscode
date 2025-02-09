import projectPackageJson from "../package.json";

export const EXTENSION_NAME = projectPackageJson.name;
export const EXTENSION_DISPLAY_NAME = projectPackageJson.displayName;
export const PUBLISHER = projectPackageJson.publisher;

export const EXTENSION_ID_WITH_PUBLISHER = projectPackageJson.publisher + "." + projectPackageJson.name;

export const SESSION_USER = `${EXTENSION_ID_WITH_PUBLISHER}.User`;
export const SESSION_TOKEN_KEY = `${EXTENSION_ID_WITH_PUBLISHER}.UserToken`;

export const API_KEY_SIGNUP_URL = "https://forms.gle/gEEZdfhWpQyQh2qVA";
export const API_SERVER_URL = process.env.NODE_ENV === "development" ?  "http://localhost:8000" : "https://djangoly-api.onrender.com";
export const GITHUB_CLIENT_ID = process.env.NODE_ENV === "development" ? "Ov23li4Egp5QaJKU3ftO" : "Ov23liV8A8SgrWwMhFwI";

export const COMMANDS = {
    USER_API_KEY: `${EXTENSION_NAME}.userApiKey`,
    GITHUB_OAUTH_CALLBACK: `${EXTENSION_NAME}.githubOauthCallback`,
    SIGN_IN: `${EXTENSION_NAME}.signIn`,
    GITHUB_SIGN_IN: `${EXTENSION_NAME}.githubSignIn`,
    SIGN_OUT: `${EXTENSION_NAME}.signOut`,
    OPEN_WALKTHROUGH: `${EXTENSION_NAME}.openWalkthrough`,
    OPEN_SETTINGS: `${EXTENSION_NAME}.openSettings`,
    ANALYZE_EXCEPTION_HANDLING: `${EXTENSION_NAME}.analyzeExceptionHandling`,
    UPDATE_CACHED_USER_TOKEN: `${EXTENSION_NAME}.updateCachedUserToken`,
} as const;

export const TELEMETRY_EVENTS = {
    EXTENSION_ACTIVATED: `${EXTENSION_ID_WITH_PUBLISHER}.extensionActivated`,
    SERVER_STARTED: `${EXTENSION_ID_WITH_PUBLISHER}.serverStarted`,
    EXCEPTION_HANDLING_TRIGGERED: `${EXTENSION_ID_WITH_PUBLISHER}.exceptionHandlingTriggered`,
    QUICK_FIX_TRIGGERED: `${EXTENSION_ID_WITH_PUBLISHER}.quickFixTriggered`,
    FALSE_POSITIVE_REPORT: `${EXTENSION_ID_WITH_PUBLISHER}.falsePositiveReport`,
    SERVER_EVENT: `${EXTENSION_ID_WITH_PUBLISHER}.serverEvent`,
    API_ALERT_SENT: `${EXTENSION_ID_WITH_PUBLISHER}.apiAlertSent`,
    EXCEPTION_HANDLING_RESULT_FEEDBACK: `${EXTENSION_ID_WITH_PUBLISHER}.exceptionHandlingResultFeedback`,
    SIGN_IN: `${EXTENSION_ID_WITH_PUBLISHER}.signIn`,
    SIGN_IN_STARTED: `${EXTENSION_ID_WITH_PUBLISHER}.signInStarted`,
    SIGN_OUT: `${EXTENSION_ID_WITH_PUBLISHER}.signOut`,
    AUTHENTICATION_FAILED: `${EXTENSION_ID_WITH_PUBLISHER}.authenticationFailed`,
    TERMS_ACCEPTED: `${EXTENSION_ID_WITH_PUBLISHER}.termsAccepted`,
    TERMS_NOT_ACCEPTED: `${EXTENSION_ID_WITH_PUBLISHER}.termsNotAccepted`,
    LEGACY_USER_MIGRATED: `${EXTENSION_ID_WITH_PUBLISHER}.legacyUserMigrated`,
} as const;

export const TELEMETRY_NOTIFICATION = {
    EVENT: 'telemetry/event',
} as const;

// TODO: Add other shared constants as needed?
export const EXTENSION_CONFIG = {
    MAX_PROBLEMS: 100,
    LANGUAGE_ID: 'python',
} as const; 


export const RATE_LIMIT_NOTIFICATION_ID = `${EXTENSION_NAME}/rateLimitReached`;
export const ACCESS_FORBIDDEN_NOTIFICATION_ID = `${EXTENSION_NAME}/forbidden`;