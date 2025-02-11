import * as sinon from 'sinon';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { AuthService } from '../common/auth/authService';
import { COMMANDS } from '../../../shared/constants';
import { MIGRATION_REMINDER, SESSION_USER } from '../common/constants';
import * as telemetry from '../../../shared/telemetry';
import { validateApiKey } from '../common/auth/api';
import { LanguageClient } from 'vscode-languageclient/node';
import { UserSession } from '../common/auth/github';
import { mockValidUserSession } from '../testFixture/mockUserSession';
import { AUTH_MESSAGES, AUTH_MODAL_TITLES } from '../common/constants/messages';

const sandbox = sinon.createSandbox();
const validateApiKeyStub = sinon.stub();

suite('AuthService Migration Tests', () => {
    let context: vscode.ExtensionContext;
    let clientStub: sinon.SinonStubbedInstance<LanguageClient>;
    let authService: AuthService;
    let mockState: Map<string, any>;
    let mockReporter: any;
    let showWarningStub: sinon.SinonStub;
    let showInfoStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;

    setup(() => {
        mockReporter = {
            sendTelemetryEvent: sandbox.stub(),
            sendTelemetryErrorEvent: sandbox.stub(),
            dispose: sandbox.stub(),
        };
        sandbox.stub(telemetry, 'reporter').value(mockReporter);

        clientStub = sinon.createStubInstance(LanguageClient);
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
        sandbox.restore();
        (global as any).reporter = undefined;
        delete global.authenticateUserWithGitHub;
        mockState.clear();
    });

    test('Should force migration prompt when API key is expired', async () => {
        const expiredSession: UserSession = {
            ...mockValidUserSession,
            session: {
                ...mockValidUserSession.session,
                    expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            }
        };
        await context.globalState.update(COMMANDS.USER_API_KEY, 'test-key');
        validateApiKeyStub.resolves(expiredSession);
        await authService.validateAuth();
        assert.strictEqual(showWarningStub.called, true, 'Warning prompt should be shown for expired key');

        const notifcationTitle = showWarningStub.firstCall.args[0];
        assert.strictEqual(
            notifcationTitle === AUTH_MODAL_TITLES.MIGRATION_REQUIRED,
            true,
            'Warning should mention migration required'
        );
        const modal = showWarningStub.firstCall.args[1];
        const expectedMessage = AUTH_MESSAGES.LEGACY_API_KEY_EXPIRED;
        assert.strictEqual(
            modal.detail === expectedMessage,
            true,
            'Warning should mention expired key'
        );
    });

    test('Should respect cooldown period for non-expired API key', async () => {
        const validSession: UserSession = {
            ...mockValidUserSession,
            session: {
                ...mockValidUserSession.session,
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
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
        const SEVEN_DAYS = 7;
        const validSession: UserSession = {
            ...mockValidUserSession,
            session: {
                ...mockValidUserSession.session,
                expires_at: new Date(Date.now() + SEVEN_DAYS * 24 * 60 * 60 * 1000).toISOString()
            }
        };
        const cooldownHoursAndOne = MIGRATION_REMINDER.COOLDOWN_HOURS + 1;
        const oldPromptTime = new Date(Date.now() - (cooldownHoursAndOne * 60 * 60 * 1000)).toISOString();
        await context.globalState.update(MIGRATION_REMINDER.LAST_PROMPTED_KEY, oldPromptTime);
        await context.globalState.update(COMMANDS.USER_API_KEY, 'test-key');

        validateApiKeyStub.resolves(validSession);
        await authService.validateAuth();
        sinon.assert.called(showInfoStub);

        const notificationTitle = showInfoStub.firstCall.args[0];
        assert.strictEqual(
            notificationTitle === AUTH_MODAL_TITLES.MIGRATION_NOTICE,
            true,
            'Info should mention migration notice'
        );

        const modal = showInfoStub.firstCall.args[1];
        const expectedMessage = AUTH_MESSAGES.LEGACY_API_KEY_MIGRATION + `\n\nNote: You have ${SEVEN_DAYS} days to migrate.`;
        assert.strictEqual(
            modal.detail === expectedMessage,
            true,
            'Info should mention migration notice'
        );
    });
    
    test('Should prevent concurrent auth validation requests', async () => {

        const validSession: UserSession = {
            ...mockValidUserSession,
            session: {
                ...mockValidUserSession.session,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            }
        };
        
        validateApiKeyStub.reset();
        let resolveValidation!: (value: any) => void;
        new Promise(resolve => {
            resolveValidation = resolve;
        });

        validateApiKeyStub.resolves(validSession);
        await context.globalState.update(COMMANDS.USER_API_KEY, 'test-key');
        await context.globalState.update(SESSION_USER, validSession);

        const firstValidation = authService.validateAuth();
        const secondValidation = authService.validateAuth();

        await Promise.all([firstValidation, secondValidation]);
        sinon.assert.calledOnce(validateApiKeyStub);
    });
});
