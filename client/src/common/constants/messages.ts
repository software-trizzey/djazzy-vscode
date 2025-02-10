import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "../../../../shared/constants";

export enum AUTH_MESSAGES  {
    FREE_API_KEY_PROMPT = "Djangoly is currently in free beta, but a valid API key is required to continue. Don't have an API key? Request one by completing the form below.",
    // TODO: Add links to our privacy policy and terms of service
    WELCOME_SIGNUP_MESSAGE = "Welcome to Djangoly! 👋 By using this extension, you agree to our [Terms of Service](" + TERMS_OF_SERVICE_URL + ") and [Privacy Policy](" + PRIVACY_POLICY_URL + ").",
    WELCOME_MESSAGE = "Welcome to Djangoly! 👋",
    INVALID_API_KEY = "The API key you entered is invalid. Please try again or request a new API key using the form below.",
    AUTHENTICATION_REQUIRED = "Authentication is required to use Djangoly. Please sign in to continue.",
    SIGN_OUT = "You have deactivated Djangoly. To reactivate, reload the current window or restart your IDE. See ya! 👋",
    GITHUB_SIGN_IN = "Sign in to continue using Djangoly. By using this extension you agree to our Terms of Service and Privacy Policy.",
    MUST_AGREE_TO_TERMS = "You must accept the Terms of Service and Privacy Policy to use Djangoly.",
    SIGN_IN_FAILURE = "Failed to sign in to Djangoly. Please try again or contact support at support@djangoly.com",
    LEGACY_API_KEY_MIGRATION = "Thanks for using Djangoly! We've updated our authentication system. Please sign in with GitHub to continue using Djangoly. If you have any questions, please contact support at support@djangoly.com",
    LEGACY_API_KEY_REQUIRED_MIGRATION = "Thanks for using Djangoly! We've updated our authentication system. GitHub authentication is now required. Please sign in with GitHub next time to continue using Djangoly. If you have any questions, please contact support at support@djangoly.com",
    LEGACY_API_KEY_EXPIRED = "Your API key authentication has expired. Please sign in with GitHub to continue using Djangoly. If you need help migrating, contact support@djangoly.com",
}
