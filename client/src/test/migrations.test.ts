import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { 
    createMigrations, 
    handleMakemigrationsDetected, 
    checkForPendingMigrations,
    handleMigrationConflict
} from '../common/utils/notifications';
import { exec } from 'child_process';

suite('Migration Utilities Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    const workspaceRoot = '/fake/workspace/root';
    const fakeVenvPath = '/fake/venv/bin/activate';

    setup(() => {
        sandbox = sinon.createSandbox();
        

        sandbox.stub(vscode.workspace, 'workspaceFolders').value([{
            uri: { fsPath: workspaceRoot } as vscode.Uri,
            name: 'test',
            index: 0
        }]);
        
        sandbox.stub({ findVirtualEnvPath: () => Promise.resolve(fakeVenvPath) });

        const fakeTerminal = {
            show: sandbox.stub(),
            sendText: sandbox.stub(),
            dispose: sandbox.stub()
        };
        sandbox.stub(vscode.window, 'createTerminal').returns(fakeTerminal as any);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('createMigrations - should create terminal and run makemigrations', async () => {
        const showMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
        
        await createMigrations(workspaceRoot);

        assert.strictEqual(showMessageStub.called, false);
        assert.strictEqual((vscode.window.createTerminal as sinon.SinonStub).called, true);
        
        const terminal = (vscode.window.createTerminal as sinon.SinonStub).firstCall.returnValue;
        assert.strictEqual(terminal.show.called, true);
        assert.strictEqual(terminal.sendText.calledWith(`cd "${workspaceRoot}"`), true);
        assert.strictEqual(terminal.sendText.calledWith(`${fakeVenvPath} && python manage.py makemigrations`), true);
    });

    test('handleMakemigrationsDetected - should detect and prompt for unapplied migrations', async () => {
        const execStub = sandbox.stub().callsFake((cmd: string, opts: any, callback: (error: any, stdout: any, stderr: any) => void) => {
            callback(null, { stdout: 'unapplied migration(s)' }, null);
        });
        sandbox.stub({ exec: execStub });
        const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves({ title: 'Apply Migrations' } as vscode.MessageItem);
        
        await handleMakemigrationsDetected();

        assert.strictEqual(showWarningStub.called, true);
        assert.strictEqual((vscode.window.createTerminal as sinon.SinonStub).called, true);
    });

    test('checkForPendingMigrations - should detect model changes and prompt for migration creation', async () => {
        const execStub = sandbox.stub().callsFake((cmd: string, opts: any, callback: (error: any, stdout: any, stderr: any) => void) => {
            callback(null, { stdout: 'Changes detected in models' }, null);
        });
        sandbox.stub({ exec: execStub });
        const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves({ title: 'Create Migration' } as vscode.MessageItem);
        
        await checkForPendingMigrations();

        assert.strictEqual(showInfoStub.called, true);
        assert.strictEqual((vscode.window.createTerminal as sinon.SinonStub).called, true);
    });

    test('handleMigrationConflict - should handle merge conflicts', async () => {
        const testFilePath = '/test/models.py';
        const execStub = sandbox.stub(exec);
        const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage');
        
        // Stub document content check
        sandbox.stub(vscode.workspace, 'openTextDocument').resolves({
            getText: () => 'No conflicts here'
        } as any);

        const result = await handleMigrationConflict(testFilePath);

        assert.strictEqual(result, true);
        assert.strictEqual(showWarningStub.called, false);
    });

    test('handleMigrationConflict - should detect unresolved conflicts', async () => {
        const testFilePath = '/test/models.py';
        const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage');
        
        // Stub document content with merge conflicts
        sandbox.stub(vscode.workspace, 'openTextDocument').resolves({
            getText: () => '<<<<<<< HEAD\nconflict\n=======\nother conflict\n>>>>>>>'
        } as any);

        const result = await handleMigrationConflict(testFilePath);

        assert.strictEqual(result, false);
        assert.strictEqual(showWarningStub.called, true);
    });
}); 