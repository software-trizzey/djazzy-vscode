/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as path from 'path';
import * as sinon from 'sinon';
import { LanguageClient } from 'vscode-languageclient/node';
import * as telemetry from '../../../shared/telemetry';


export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;
const sandbox = sinon.createSandbox();
let languageClientStub: sinon.SinonStubbedInstance<LanguageClient>;


/**
 * Activates the vscode.lsp-sample extension
 */
export async function activate(docUri: vscode.Uri) {
	// The extensionId is `publisher.name` from package.json
	const ext = vscode.extensions.getExtension('vscode-samples.lsp-sample')!;
	await ext.activate();
	try {
		doc = await vscode.workspace.openTextDocument(docUri);
		editor = await vscode.window.showTextDocument(doc);
		await sleep(2000); // Wait for server activation
	} catch (e) {
		console.error(e);
	}
}

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export const getDocPath = (p: string) => {
	return path.resolve(__dirname, '../../testFixture', p);
};
export const getDocUri = (p: string) => {
	return vscode.Uri.file(getDocPath(p));
};

export async function setTestContent(content: string): Promise<boolean> {
	const all = new vscode.Range(
		doc.positionAt(0),
		doc.positionAt(doc.getText().length)
	);
	return editor.edit(eb => eb.replace(all, content));
}

export function setupTestEnvironment() {
	const sandbox = sinon.createSandbox();
    sandbox.restore(); 

	const mockReporter = {
		sendTelemetryEvent: sandbox.stub(),
		sendTelemetryErrorEvent: sandbox.stub(),
		dispose: sandbox.stub(),
	};
	
	sandbox.stub(telemetry, 'reporter').value(mockReporter);

    // Mock LanguageClient to prevent UI interactions
    languageClientStub = sinon.createStubInstance(LanguageClient);
    languageClientStub.start.resolves();
    languageClientStub.stop.resolves();
    languageClientStub.sendRequest.resolves(undefined);
    languageClientStub.onNotification.callsFake(() => ({ dispose: sandbox.stub() }));

	sandbox.stub(vscode.env, 'machineId').value('test-machine-id');

    sandbox.stub(vscode.extensions, 'getExtension').returns({
        activate: async () => ({}),
    } as any);

    sandbox.stub(vscode.workspace, 'getConfiguration').returns({
        get: sandbox.stub().returns(undefined),
        update: sandbox.stub().resolves(),
    } as any);


    sandbox.stub(vscode.window, 'showWarningMessage').resolves('Sign in with GitHub' as any);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves('Remind me later' as any);
    sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

	sandbox.stub(vscode.authentication, 'getSession').rejects(
		new Error('Authentication failed.')
	);

    return { sandbox, clientStub: languageClientStub, reporter: mockReporter };
}

export function cleanupTestEnvironment() {
	sandbox.restore();
}