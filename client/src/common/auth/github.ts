import * as vscode from "vscode";

import { API_SERVER_URL, SESSION_TOKEN_KEY, SESSION_USER} from "@shared/constants";

export interface UserSession {
	token: string;
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
    }
}

const GITHUB_CLIENT_ID = "Ov23li4Egp5QaJKU3ftO";
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
			console.error('Error handling session change:', error);
			await this.clearSession();
		}
	}

	getCurrentSession(): UserSession | undefined {
		return this.context.globalState.get<UserSession>(SESSION_USER);
	}

	async signIn(): Promise<UserSession> {
		console.log("Starting GitHub sign-in flow");

		const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: true });

		if (!session || !session.accessToken) {
			throw new Error("Failed to authenticate with GitHub");
		}

		const userSession = await this.exchangeTokenWithDjango(session.accessToken);
		await this.updateSession(userSession);
		return userSession;
	}

	async signOut(): Promise<void> {
        console.log("Signing out from GitHub");
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
        const session = await this.getCurrentSession();
        if (!session) return;
    
        try {
            const response = await fetch(`${API_SERVER_URL}/auth/signout/`, {
                method: "POST",
                headers: {
                    "X-Session-Token": session.session.key
                }
            });
    
            if (!response.ok) {
                throw new Error("Failed to sign out");
            }
    
            await this.context.globalState.update(SESSION_TOKEN_KEY, undefined);
            await this.context.globalState.update(SESSION_USER, undefined);
            this.sessionChangeEmitter.fire(undefined);
        } catch (error) {
            console.error("Error during sign out:", error);
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

		if (!response.ok) {
			throw new Error("Failed to exchange GitHub token for Django session token");
		}

		const data = await response.json() as UserSession;
		return data;
	}
}
