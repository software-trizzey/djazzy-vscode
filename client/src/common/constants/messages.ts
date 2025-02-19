import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "../../../../shared/constants";

export const AUTH_MODAL_TITLES = {
    MIGRATION_REQUIRED: "Djazzy: Auth Migration Required",
    MIGRATION_NOTICE: "Djazzy: Auth Migration Notice",
};

export enum AUTH_MESSAGES  {
    FREE_API_KEY_PROMPT = "Djazzy is currently in free beta, but a valid API key is required to continue. Don't have an API key? Request one by completing the form below.",
    // TODO: Add links to our privacy policy and terms of service
    WELCOME_SIGNUP_MESSAGE = "Welcome to Djazzy! 👋 By using this extension, you agree to our [Terms of Service](" + TERMS_OF_SERVICE_URL + ") and [Privacy Policy](" + PRIVACY_POLICY_URL + ").",
    WELCOME_MESSAGE = "Welcome to Djazzy! 👋",
    INVALID_API_KEY = "The API key you entered is invalid. Please try again or request a new API key using the form below.",
    AUTHENTICATION_REQUIRED = "Authentication is required to use Djazzy. Please sign in to continue.",
    GENERAL_AUTH_ERROR = "An error occurred while authenticating. Please try again or contact support at support@djazzy.com",
    SIGN_OUT = "You have deactivated Djazzy. To reactivate, reload the current window or restart your IDE. See ya! 👋",
    GITHUB_SIGN_IN = "Sign in to continue using Djazzy. By using this extension you agree to our Terms of Service and Privacy Policy.",
    MUST_AGREE_TO_TERMS = "You must accept the Terms of Service and Privacy Policy to use Djazzy.",
    SIGN_IN_FAILURE = "Failed to sign in to Djazzy. Please try again or contact support at support@djazzy.com",
    LEGACY_API_KEY_MIGRATION = "We've updated our authentication system. Please sign in with GitHub to continue using Djazzy.\n\nIf you have any questions, please contact support at support@djazzy.com",
    LEGACY_API_KEY_EXPIRED = "Your API key has expired. Please sign in with GitHub to continue using Djazzy.\n\nIf you need help migrating, contact support@djazzy.com",
    LEGACY_AUTH_FAILED = "Your API key authentication has failed. Please sign in with GitHub to continue using Djazzy. If you need help migrating, contact support@djazzy.com",
    LEGACY_USER_MIGRATED = "You've successfully migrated to GitHub authentication. Welcome to Djazzy! 👋",
    NO_EMAIL_ADDRESS = "You must add and verify an email address to your GitHub account before continuing.",
}
