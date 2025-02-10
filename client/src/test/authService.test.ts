import * as sinon from 'sinon';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { AuthService } from '../common/auth/authService';
import { COMMANDS } from '../../../shared/constants';
import { MIGRATION_REMINDER } from '../common/constants';

import * as telemetry from '../../../shared/telemetry';
import { validateApiKey } from '../common/auth/api';

const sandbox = sinon.createSandbox();
const validateApiKeyStub = sinon.stub();

suite('AuthService Migration Tests', () => {
    let context: vscode.ExtensionContext;
    let authService: AuthService;
    let mockState: Map<string, any>;
    let mockReporter: any;
    let showWarningStub: sinon.SinonStub;
    let showInfoStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;

    const mockValidUserSession = {
        token: 'test-token',
        user: {
            has_agreed_to_terms: true,
            id: 'test-user-id',
            email: 'test@example.com',
            github_login: 'test-github-login'
        },
        session: {
            id: 1,
            key: 'test-session-key',
            created_at: new Date().toISOString(),
            data: {
                expires_at: new Date(Date.now() + MIGRATION_REMINDER.COOLDOWN_HOURS * 60 * 60 * 1000).toISOString() 
            }
        },
        migration_notice: 'test-migration-notice'
    };

    setup(() => {
        mockReporter = {
            sendTelemetryEvent: sandbox.stub(),
            sendTelemetryErrorEvent: sandbox.stub(),
            dispose: sandbox.stub(),
        };

        sandbox.stub(telemetry, 'reporter').value(mockReporter);

        // Stubbing vscode.window methods inside setup() so they're fresh for each test
        showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves('Sign in with GitHub' as any);
        showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves('Remind me later' as any);
        showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

        mockState = new Map();
        context = {
            globalState: {
                get: (key: string) => mockState.get(key),
                update: async (key: string, value: any) => mockState.set(key, value)
            }
        } as any;

        global.authenticateUserWithGitHub = async () => mockValidUserSession;

        authService = new AuthService(context, validateApiKeyStub);
    });

    teardown(() => {
        sandbox.restore(); // This will restore all stubs and reset mocks
        (global as any).reporter = undefined;
        delete global.authenticateUserWithGitHub;
        mockState.clear();
    });

    test('Should force migration prompt when API key is expired', async () => {
        const expiredSession = {
            ...mockValidUserSession,
            session: {
                ...mockValidUserSession.session,
                data: {
                    expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Expired yesterday
                }
            }
        };

        await context.globalState.update(COMMANDS.USER_API_KEY, 'test-key');
        validateApiKeyStub.resolves(expiredSession);

        await authService.validateAuth();

        assert.strictEqual(showWarningStub.called, true, 'Warning prompt should be shown for expired key');
        assert.strictEqual(showWarningStub.firstCall.args[0].includes('expired'), true, 'Warning should mention expiration');
    });

    test('Should respect cooldown period for non-expired API key', async () => {
        const validSession = {
            ...mockValidUserSession,
            session: {
                ...mockValidUserSession.session,
                data: {
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Expires in 7 days
                }
            }
        };

        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        await context.globalState.update(MIGRATION_REMINDER.LAST_PROMPTED_KEY, twoHoursAgo);
        validateApiKeyStub.resolves(validSession);

        await context.globalState.update(COMMANDS.USER_API_KEY, 'test-key');
        await authService.validateAuth();

        assert.strictEqual(showInfoStub.called, false, 'Info prompt should not be shown during cooldown');
        assert.strictEqual(
            await context.globalState.get(MIGRATION_REMINDER.LAST_PROMPTED_KEY),
            twoHoursAgo,
            'Reminder timestamp should not change during cooldown'
        );
    });

    test('Should show migration prompt after cooldown period', async () => {
        const validSession = {
            ...mockValidUserSession,
            session: {
                ...mockValidUserSession.session,
                data: {
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                }
            }
        };

        const cooldownHoursAndOne = MIGRATION_REMINDER.COOLDOWN_HOURS + 1;
        const oldPromptTime = new Date(Date.now() - (cooldownHoursAndOne * 60 * 60 * 1000)).toISOString();
        await context.globalState.update(MIGRATION_REMINDER.LAST_PROMPTED_KEY, oldPromptTime);
        await context.globalState.update(COMMANDS.USER_API_KEY, 'test-key');

        validateApiKeyStub.resolves(validSession);

        await authService.validateAuth();

        sinon.assert.called(showInfoStub);
        assert.strictEqual(showInfoStub.firstCall.args[0].includes('7 days'), true);
    });
});
