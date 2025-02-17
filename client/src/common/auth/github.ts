import * as vscode from "vscode";

import {
	API_SERVER_URL,
	GITHUB_CLIENT_ID,
	SESSION_TOKEN_KEY,
	SESSION_USER
} from "../../../../shared/constants";
import { MIGRATION_REMINDER } from '../constants';
import { logger } from '../log';

export interface UserSession {
	token: string;
	is_valid?: boolean;
	user: {
		id: string;
		email: string;
		github_login: string;
		has_agreed_to_terms: boolean;
	};
	session: {
		id: number;
		key: string;
		created_at: string;
		expires_at?: string;
		auth_method?: 'api_key' | 'github';
	};
	migration_notice?: string;
}

const GITHUB_AUTH_PROVIDER_ID = "github";
const SCOPES = ["read:user", "user:email"];

export class GitHubAuthProvider {
	private sessionChangeEmitter = new vscode.EventEmitter<UserSession | undefined>();
	readonly onDidChangeSession = this.sessionChangeEmitter.event;

	constructor(private context: vscode.ExtensionContext) {
		vscode.authentication.onDidChangeSessions(async e => {
			if (e.provider.id === GITHUB_AUTH_PROVIDER_ID) {
				await this.handleSessionChange();
			}
		});
	}

	private async handleSessionChange() {
		try {
			const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: false });
			if (!session) {
				await this.clearSession();
			}
		} catch (error) {
			logger.error(`Error handling session change: ${error}`);
			await this.clearSession();
		}
	}

	getCurrentSession(): UserSession | undefined {
		return this.context.globalState.get<UserSession>(SESSION_USER);
	}

	async signIn(): Promise<UserSession> {
		logger.info("Starting GitHub sign-in flow");

		const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: true });

		if (!session || !session.accessToken) {
			throw new Error("Failed to authenticate with GitHub");
		}

		const userSession = await this.exchangeTokenWithDjango(session.accessToken);
		await this.updateSession(userSession);
		return userSession;
	}

	async signOut(): Promise<void> {
		await this.clearSession();
	}

    async acceptTerms(): Promise<void> {
        const session = this.getCurrentSession();
        if (!session) {
            throw new Error("No session found");
        }

        const response = await fetch(`${API_SERVER_URL}/auth/users/${session.user.id}/`, {
            method: "PATCH",
            headers: {
                "X-Session-Token": session.session.key,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                has_agreed_to_terms: true
            })
        });

        if (!response.ok) {
            throw new Error("Failed to accept terms");
        }

        const updatedSession = {
            ...session,
            user: {
                ...session.user,
                has_agreed_to_terms: true
            }
        };

        await this.context.globalState.update(SESSION_USER, updatedSession);
        this.sessionChangeEmitter.fire(updatedSession);
    }

	private async updateSession(session: UserSession) {
		await this.context.globalState.update(SESSION_TOKEN_KEY, session.token);
		await this.context.globalState.update(SESSION_USER, session);
		this.sessionChangeEmitter.fire(session);
	}

    private async clearSession() {
        const session = this.getCurrentSession();
        if (!session) return;
    
        try {
			logger.info(`Clearing session: server url: ${API_SERVER_URL}/auth/signout/`);
            const response = await fetch(`${API_SERVER_URL}/auth/signout/`, {
                method: "POST",
                headers: {
                    "X-Session-Token": session.session.key,
					"Content-Type": "application/json"
                },
				body: JSON.stringify({
					session_key: session.session.key
				})
            });
    
            if (!response.ok) {
                throw new Error(`Failed to sign out: ${response.statusText}`);
            }
    
            await this.context.globalState.update(SESSION_TOKEN_KEY, undefined);
            await this.context.globalState.update(SESSION_USER, undefined);
			await this.context.globalState.update(MIGRATION_REMINDER.LAST_PROMPTED_KEY, undefined);
            this.sessionChangeEmitter.fire(undefined);
        } catch (error) {
            logger.error(`${error}`);
            throw error;
        }
    }

	private async exchangeTokenWithDjango(githubToken: string): Promise<UserSession> {
		const response = await fetch(`${API_SERVER_URL}/_allauth/browser/v1/auth/provider/token`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				provider: GITHUB_AUTH_PROVIDER_ID,
				process: "login", // note this will sign the user up if they don't exist
				token: {
					client_id: GITHUB_CLIENT_ID,
					access_token: githubToken,
				}
			})
		});

		const data = await response.json();

		interface ErrorResponse {
			detail?: string;
		}

		interface AuthResponse {
			token: string;
			user: UserSession['user'];
			session: UserSession['session'];
		}

		if (!response.ok) {
			const errorData = data as ErrorResponse;
			switch (response.status) {
				case 400:
					if (errorData.detail?.includes("no email address")) {
						throw new Error(
							"No email address found. Please add and verify an email address to your GitHub account before continuing."
						);
					}
					throw new Error(`Bad request: ${errorData.detail || 'Unknown error'}`);
					
				case 403:
					if (errorData.detail?.includes("Invalid GitHub token")) {
						throw new Error("GitHub authentication failed. Please try again.");
					}
					throw new Error(`Authentication failed: ${errorData.detail || 'Access denied'}`);
					
				case 429:
					throw new Error("Too many authentication attempts. Please try again later.");
					
				default:
					throw new Error(
						`Failed to exchange GitHub token for Django session token: ${errorData.detail || response.statusText}`
					);
			}
		}

		const authData = data as AuthResponse;
		if (!authData.token || !authData.user || !authData.session) {
			throw new Error("Invalid response format from authentication server");
		}

		return authData as UserSession;
	}
}
