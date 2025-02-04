import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'path';
import { activate, activateClientNotifications } from '../extension';
import { LanguageClient } from 'vscode-languageclient/node';
import { reporter, initializeTelemetry } from '../../../shared/telemetry';
import { TELEMETRY_EVENTS } from '../../../shared/constants';

suite('Client Extension Tests', function () {
    let context: vscode.ExtensionContext;
    let clientStub: sinon.SinonStubbedInstance<LanguageClient>;
    let telemetryStub: sinon.SinonStub;

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
        // Stub the telemetry reporter
        telemetryStub = sinon.stub(reporter, 'sendTelemetryEvent');

        sinon.stub(vscode.env, 'machineId').value('test-machine-id');
    });

    teardown(() => {
        sinon.restore();
    });

    test('Telemetry is initialized and events are sent on activation', async () => {
        const pushStub = sinon.stub(context.subscriptions, 'push');
        
        // Call activate
        await activate(context);
        
        // Verify reporter was initialized and added to subscriptions
        assert(pushStub.calledOnce, 'Reporter should be added to subscriptions');
        
        // Verify activation event was sent
        assert(telemetryStub.calledWith(
            TELEMETRY_EVENTS.EXTENSION_ACTIVATED
        ), 'Extension activated event should be sent');
    });

    test('Client notifications are activated correctly', () => {
        const showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');

        activateClientNotifications(clientStub as unknown as LanguageClient);

        clientStub.onNotification.yield({ message: 'Rate limit exceeded' });
        assert(showWarningMessageStub.calledWith(sinon.match('Rate limit exceeded'), sinon.match('Okay')), 'Warning message should be shown');

        clientStub.onNotification.yield({ message: 'Access forbidden' });
        assert(showErrorMessageStub.calledWith(sinon.match('Access forbidden')), 'Error message should be shown');
    });
});
