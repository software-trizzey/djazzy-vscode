import * as vscode from "vscode";
import { reporter } from '../../../../shared/telemetry';
import { COMMANDS, SESSION_TOKEN_KEY, SESSION_USER, TELEMETRY_EVENTS } from '../../../../shared/constants';
import { AUTH_MESSAGES, AUTH_MODAL_TITLES } from '../constants/messages';
import { UserSession } from './github';
import { authenticateUserWithGitHub, signOutUser, validateApiKey } from './api';
import { MIGRATION_REMINDER } from '../constants';

export class AuthService {
    constructor(
        private context: vscode.ExtensionContext,
        private handleValidateApiKey: typeof validateApiKey = validateApiKey
    ) {}

    private authInProgress = false;

    async validateAuth(): Promise<boolean> {
        console.log('Authenticating user...');
        if (this.authInProgress) {
            console.log('Auth already in progress...');
            return true;
        }

		let session: UserSession | undefined;
		let legacyApiKey: string | undefined;

        try {
            this.authInProgress = true;
            session = this.context.globalState.get<UserSession>(SESSION_USER);
            if (process.env.NODE_ENV === 'development' && process.env.DEV_API_KEY) {
                this.context.globalState.update(COMMANDS.USER_API_KEY, process.env.DEV_API_KEY);
            }
            legacyApiKey = this.context.globalState.get<string>(COMMANDS.USER_API_KEY);
            console.log('Session:', session);
            console.log('Legacy API key:', legacyApiKey);
            console.log("isDev", process.env.NODE_ENV === 'development');

            if (legacyApiKey && !session) {
                console.log('Handling legacy auth...');
                const result = await this.handleLegacyAuth(legacyApiKey);
                if (!result) {
                    const tryGitHub = await vscode.window.showWarningMessage(
                        AUTH_MESSAGES.LEGACY_API_KEY_MIGRATION,
                        "Try GitHub Sign-in"
                    );
                    if (tryGitHub) {
                        const result = await this.handleGitHubAuth();
                        if (result) {
                            vscode.window.showInformationMessage(AUTH_MESSAGES.LEGACY_USER_MIGRATED, "Okay");
                        }
                        return result;
                    }
                }
                return result;
            } else if (!session || !session.user.has_agreed_to_terms) {
                console.log('Handling GitHub auth...');
                return await this.handleGitHubAuth();
            }

            return true;
        } catch (error) {
            console.error('Auth validation error:', error);
			reporter.sendTelemetryErrorEvent(TELEMETRY_EVENTS.AUTHENTICATION_FAILED, {
				reason: 'Auth validation error',
				user_id: session?.user.id || legacyApiKey || 'unknown',
			});
            vscode.window.showErrorMessage(AUTH_MESSAGES.GENERAL_AUTH_ERROR);
            return false;
        } finally {
            this.authInProgress = false;
        }
    }

    getSession(): UserSession | undefined {
        return this.context.globalState.get<UserSession>(SESSION_USER);
    }

    async signOut(): Promise<void> {
        await signOutUser(this.context);
        vscode.window.showInformationMessage(AUTH_MESSAGES.SIGN_OUT);
    }

    private async handleLegacyAuth(legacyApiKey: string): Promise<boolean> {
        try {
            const apiKeySession = await this.handleValidateApiKey(legacyApiKey);
            if (!apiKeySession) {
                vscode.window.showErrorMessage(AUTH_MESSAGES.INVALID_API_KEY);
                return false;
            }

            const migrationResult = await this.promptMigration(
                legacyApiKey, 
                this.calculateDaysLeft(apiKeySession)
            );

            if (migrationResult) {
                await this.context.globalState.update(SESSION_TOKEN_KEY, apiKeySession.token);
                await this.context.globalState.update(SESSION_USER, apiKeySession);
                // clear legacy api key to prevent it from being used again
                await this.context.globalState.update(COMMANDS.USER_API_KEY, undefined);
            }

            return migrationResult;
        } catch (error) {
            console.error('Legacy auth error:', error);
            vscode.window.showErrorMessage(AUTH_MESSAGES.GENERAL_AUTH_ERROR);
            return false;
        }
    }

    private calculateDaysLeft(apiKeySession: UserSession): number {
        const expiresAt = new Date(apiKeySession.session?.expires_at || '');
        const today = new Date();
        const daysLeft = Math.ceil((expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return daysLeft;
    }

    private async promptMigration(legacyApiKey: string, daysLeft: number): Promise<boolean> {
        try {
            const lastPrompted = this.context.globalState.get<string>(MIGRATION_REMINDER.LAST_PROMPTED_KEY);
            const now = new Date();
            if (lastPrompted) {
                const lastPromptedDate = new Date(lastPrompted);
                const hoursSinceLastPrompt = (now.getTime() - lastPromptedDate.getTime()) / (1000 * 60 * 60);
                console.log('Hours since last prompt:', hoursSinceLastPrompt);
    
                if (hoursSinceLastPrompt < MIGRATION_REMINDER.COOLDOWN_HOURS) {
                    console.log('Skipping migration prompt due to cooldown.');
                    return true;
                }
            }
    
            const migrateAction = "Sign in with GitHub";
            const remindLater = "Remind me later";
            let response;

            if (daysLeft <= 0) {
                response = await vscode.window.showWarningMessage(
                    AUTH_MODAL_TITLES.MIGRATION_REQUIRED,
                    {
                        modal: true,
                        detail: AUTH_MESSAGES.LEGACY_API_KEY_EXPIRED
                    },
                    migrateAction
                );
            } else {
                response = await vscode.window.showInformationMessage(
                    AUTH_MODAL_TITLES.MIGRATION_NOTICE,
                    {
                        modal: true,
                        detail: AUTH_MESSAGES.LEGACY_API_KEY_MIGRATION + `\n\nNote: You have ${daysLeft} days to migrate.`,
                    },
                    migrateAction,
                    remindLater // Note: this does the same as "cancel" button but is more user friendly
                );
            }
    
            await this.context.globalState.update(MIGRATION_REMINDER.LAST_PROMPTED_KEY, now.toISOString());
    
            if (response === migrateAction) {
                const isAuthenticated = await authenticateUserWithGitHub(this.context);
                if (isAuthenticated) {
                    console.log('User migrated to GitHub auth.');
                    vscode.window.showInformationMessage(AUTH_MESSAGES.LEGACY_USER_MIGRATED, "Okay");
                    await this.context.globalState.update(COMMANDS.USER_API_KEY, undefined);
                    await this.context.globalState.update(MIGRATION_REMINDER.LAST_PROMPTED_KEY, undefined);
                    reporter.sendTelemetryEvent(TELEMETRY_EVENTS.LEGACY_USER_MIGRATED);
                }
                return isAuthenticated;
            }

			// if user refused migration and days left is 0 we should block them and
			// state that they can't continue without migrating
			if (daysLeft <= 0) {
				vscode.window.showErrorMessage(AUTH_MESSAGES.LEGACY_API_KEY_EXPIRED, "I understand");
				return false;
			}
    
            console.log('User postponed migration.');
            reporter.sendTelemetryEvent(TELEMETRY_EVENTS.LEGACY_USER_POSTPONED, {
                days_left: daysLeft.toString(),
                user_api_key: legacyApiKey,
            });
            return true;
        } catch (error) {
            console.error('Error during auth migration sequence:', error);
            throw error;
        }
    }

    private async handleGitHubAuth(): Promise<boolean> {
        const isAuthenticated = await authenticateUserWithGitHub(this.context);
        if (!isAuthenticated) {
            vscode.window.showWarningMessage(AUTH_MESSAGES.AUTHENTICATION_REQUIRED);
            reporter.sendTelemetryErrorEvent(TELEMETRY_EVENTS.AUTHENTICATION_FAILED, {
                reason: 'User did not authenticate',
                user_id: this.context.globalState.get<UserSession>(SESSION_USER)?.user.id || 'unknown',
            });
            console.log('Failed to authenticate user.');
            return false;
        }

        const updatedSession = this.context.globalState.get<UserSession>(SESSION_USER);
        if (!updatedSession?.user.has_agreed_to_terms) {
            vscode.window.showErrorMessage(AUTH_MESSAGES.MUST_AGREE_TO_TERMS);
            reporter.sendTelemetryErrorEvent(TELEMETRY_EVENTS.TERMS_NOT_ACCEPTED, {
                reason: 'User did not agree to terms',
                user_id: updatedSession?.user.id || 'unknown',
            });
            console.log('User has not agreed to terms.');
            return false;
        }

        return true;
    }
} 