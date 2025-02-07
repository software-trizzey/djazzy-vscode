import projectPackageJson from "../package.json";

export const EXTENSION_NAME = projectPackageJson.name;
export const EXTENSION_DISPLAY_NAME = projectPackageJson.displayName;
export const PUBLISHER = projectPackageJson.publisher;

export const EXTENSION_ID_WITH_PUBLISHER = projectPackageJson.publisher + "." + projectPackageJson.name;

export const SESSION_USER = `${EXTENSION_ID_WITH_PUBLISHER}.User`;
export const SESSION_TOKEN_KEY = `${EXTENSION_ID_WITH_PUBLISHER}.UserToken`;

export const API_SERVER_URL = process.env.NODE_ENV === "development" ?  "http://localhost:8000" : "https://djangoly-api.onrender.com";

export const COMMANDS = {
    USER_API_KEY: `${EXTENSION_NAME}.userApiKey`,
    GITHUB_OAUTH_CALLBACK: `${EXTENSION_NAME}.githubOauthCallback`,
    GITHUB_SIGN_IN: `${EXTENSION_NAME}.githubSignIn`,
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
} as const;

export const TELEMETRY_NOTIFICATION = {
    EVENT: 'telemetry/event',
} as const;

// TODO: Add other shared constants as needed?
export const EXTENSION_CONFIG = {
    MAX_PROBLEMS: 100,
    LANGUAGE_ID: 'yourLanguage',
} as const; 