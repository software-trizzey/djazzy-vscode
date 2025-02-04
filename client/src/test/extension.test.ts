import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'path';
import { activateClientNotifications } from '../extension';
import { LanguageClient } from 'vscode-languageclient/node';

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

        sinon.stub(vscode.env, 'machineId').value('test-machine-id');
    });

    teardown(() => {
        sinon.restore();
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
