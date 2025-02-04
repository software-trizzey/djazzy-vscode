import projectPackageJson from "../package.json";

export const EXTENSION_NAME = projectPackageJson.name;
export const EXTENSION_DISPLAY_NAME = projectPackageJson.displayName;
export const EXTENSION_ID = projectPackageJson.publisher + "." + projectPackageJson.name;
export const PUBLISHER = projectPackageJson.publisher;

export const SESSION_USER = `${EXTENSION_ID}User`;
export const SESSION_TOKEN_KEY = `${EXTENSION_ID}UserToken`;

export const API_SERVER_URL = process.env.NODE_ENV === "development" ?  "http://localhost:8000" : "https://djangoly-api.onrender.com";

export const TELEMETRY_EVENTS = {
    EXTENSION_ACTIVATED: `${EXTENSION_ID}.extensionActivated`,
    SERVER_STARTED: `${EXTENSION_ID}.serverStarted`,
    EXCEPTION_HANDLING_TRIGGERED: `${EXTENSION_ID}.exceptionHandlingTriggered`,
    QUICK_FIX_TRIGGERED: `${EXTENSION_ID}.quickFixTriggered`,
    FALSE_POSITIVE_REPORT: `${EXTENSION_ID}.falsePositiveReport`,
} as const;

// TODO: Add other shared constants as needed?
export const EXTENSION_CONFIG = {
    MAX_PROBLEMS: 100,
    LANGUAGE_ID: 'yourLanguage',
} as const; 