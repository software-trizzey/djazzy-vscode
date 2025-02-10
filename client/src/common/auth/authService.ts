import * as vscode from "vscode";
import { reporter } from '../../../../shared/telemetry';
import { COMMANDS, SESSION_TOKEN_KEY, SESSION_USER, TELEMETRY_EVENTS } from '../../../../shared/constants';
import { AUTH_MESSAGES } from '../constants/messages';
import { UserSession } from './github';
import { authenticateUserWithGitHub, validateApiKey } from './api';

export class AuthService {
    constructor(private context: vscode.ExtensionContext) {}

    async validateAuth(): Promise<boolean> {
        const session = this.context.globalState.get<UserSession>(SESSION_USER);
        const legacyApiKey = this.context.globalState.get<string>(COMMANDS.USER_API_KEY);

        if (legacyApiKey && !session) {
            return await this.handleLegacyAuth(legacyApiKey);
        } else if (!session || !session.user.has_agreed_to_terms) {
            return await this.handleGitHubAuth();
        }

        return true;
    }

    private async handleLegacyAuth(legacyApiKey: string): Promise<boolean> {
        const apiKeySession = await validateApiKey(legacyApiKey);
        if (!apiKeySession) {
            vscode.window.showErrorMessage(AUTH_MESSAGES.INVALID_API_KEY);
            return false;
        }

        const expiresAt = new Date(apiKeySession.session.data?.expires_at || '');
        if (!apiKeySession.session.data?.expires_at || isNaN(expiresAt.getTime())) {
            console.error('Invalid expiration date from server');
            vscode.window.showErrorMessage(AUTH_MESSAGES.INVALID_API_KEY);
            return false;
        }

        if (apiKeySession.migration_notice) {
            console.log('Migration notice:', apiKeySession.migration_notice);
        }

        await this.context.globalState.update(SESSION_TOKEN_KEY, apiKeySession.token);
        await this.context.globalState.update(SESSION_USER, apiKeySession);

        const today = new Date();
        const daysLeft = Math.ceil((expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        return await this.promptMigration(legacyApiKey, daysLeft);
    }

    private async promptMigration(legacyApiKey: string, daysLeft: number): Promise<boolean> {
        const migrateAction = "Sign in with GitHub";
        const remindLater = "Remind me later";

        const response = await vscode.window.showInformationMessage(
            AUTH_MESSAGES.LEGACY_API_KEY_MIGRATION + ` You have ${daysLeft} days to migrate.`,
            migrateAction,
            remindLater
        );

        if (response === migrateAction) {
            const isAuthenticated = await authenticateUserWithGitHub(this.context);
            if (isAuthenticated) {
                await this.context.globalState.update(COMMANDS.USER_API_KEY, undefined);
                reporter.sendTelemetryEvent(TELEMETRY_EVENTS.LEGACY_USER_MIGRATED);
            }
            return isAuthenticated;
        } 

        reporter.sendTelemetryEvent(TELEMETRY_EVENTS.LEGACY_USER_POSTPONED, {
            days_left: daysLeft.toString(),
            user_api_key: legacyApiKey,
        });
        return true;
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