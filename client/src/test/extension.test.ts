import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'path';
import { activate, deactivate, activateClientNotifications } from '../extension';
import { LanguageClient } from 'vscode-languageclient/node';
import * as logs from '../common/logs';
import * as commands from '../common/commands';
import { rollbar } from '../common/logs';

suite('Client Extension Tests', function () {
    let context: vscode.ExtensionContext;
    let clientStub: sinon.SinonStubbedInstance<LanguageClient>;

    setup(() => {
        context = {
            globalState: {
                get: sinon.stub().returns(false),
                update: sinon.stub().resolves()
            },
            extension: {
                packageJSON: {
                    version: '1.0.0'
                }
            },
            asAbsolutePath: (relativePath: string) => path.join(__dirname, relativePath),
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        clientStub = sinon.createStubInstance(LanguageClient);

        sinon.stub(rollbar, 'log');
        sinon.stub(rollbar, 'info');
        sinon.stub(rollbar, 'error');

        sinon.stub(vscode.env, 'machineId').value('test-machine-id');
    });

    teardown(() => {
        sinon.restore();
    });

    test('Extension activates correctly', async () => {
        const trackActivationSpy = sinon.spy(logs, 'trackActivation');
        const registerCommandsSpy = sinon.spy(commands, 'registerCommands');
        const startClientStub = sinon.stub(LanguageClient.prototype, 'start').resolves();

        await activate(context);

        assert(trackActivationSpy.calledOnce, 'trackActivation should be called once');
        sinon.assert.calledWith(trackActivationSpy, context);

        assert(registerCommandsSpy.calledOnce, 'registerCommands should be called once');
        sinon.assert.calledWith(registerCommandsSpy, context);

        assert(startClientStub.calledOnce, 'LanguageClient should be started once');
    });

    test('Extension deactivates correctly', async () => {
        const trackDeactivationSpy = sinon.spy(logs, 'trackDeactivation');
        const stopClientStub = sinon.stub(LanguageClient.prototype, 'stop').resolves();

        await deactivate(context);

        assert(trackDeactivationSpy.calledOnce, 'trackDeactivation should be called once');
        assert(stopClientStub.calledOnce, 'LanguageClient should be stopped once');
    });

    test('Client notifications are activated correctly', () => {
        const showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');

        activateClientNotifications(clientStub as unknown as LanguageClient);

        clientStub.onNotification.yield({ message: 'Rate limit exceeded' });
        assert(showWarningMessageStub.calledWith('Rate limit exceeded', 'Okay'), 'Warning message should be shown');

        clientStub.onNotification.yield({ message: 'Access forbidden' });
        assert(showErrorMessageStub.calledWith('Access forbidden'), 'Error message should be shown');
    });
});
