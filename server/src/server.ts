import * as path from "path";
import * as dotenv from "dotenv";
const result = dotenv.config({ path: path.resolve(__dirname, "../.env") });
if (result.error) {
	console.log("Failed to load .env file");
	throw result.error;
}

import {
	createConnection,
	TextDocuments,
	Diagnostic,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	DidChangeWatchedFilesParams,
	CodeActionKind,
	CompletionItem,
	CompletionItemKind,
	TextEdit,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	TextDocumentEdit,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

import { rollbar } from "./common/logs";
import {
	LanguageProvider,
	JavascriptAndTypescriptProvider,
	PythonProvider,
} from "./providers";
import { ExtensionSettings, defaultSettings } from "./settings";
import { debounce } from "./utils";

import { FIX_NAME } from "./constants/commands";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);
const providerCache: Record<string, LanguageProvider> = {};

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

// FIXME: hide access token

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: {
				resolveProvider: true,
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false,
			},
			codeActionProvider: {
				codeActionKinds: [CodeActionKind.QuickFix],
			},
			renameProvider: {
				prepareProvider: true,
			},
			executeCommandProvider: {
				commands: [FIX_NAME],
			},
		},
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true,
			},
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		connection.client.register(
			DidChangeConfigurationNotification.type,
			undefined
		);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders((_event) => {
			connection.console.log("Workspace folder change event received.");
		});
	}
});

let globalSettings: ExtensionSettings = defaultSettings;

const documentSettings: Map<string, Thenable<ExtensionSettings>> = new Map();

connection.onDidChangeConfiguration((change) => {
	if (hasConfigurationCapability) {
		documentSettings.clear();
	} else {
		globalSettings = <ExtensionSettings>(
			(change.settings.whenInRome || defaultSettings)
		);
	}
	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// TODO: We could optimize things here and re-fetch the setting first and compare it
	// to the existing setting
	connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<ExtensionSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: "whenInRome",
		});
		documentSettings.set(resource, result);
	}
	return result;
}

documents.onDidClose((e) => {
	const documentUri = e.document.uri;
	const provider = providerCache[e.document.languageId];
	documentSettings.delete(documentUri);
	provider?.deleteDiagnostic(documentUri);
});

connection.languages.diagnostics.on(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: [],
		} satisfies DocumentDiagnosticReport;
	}
	const diagnostics = await validateTextDocument(document);
	return {
		kind: DocumentDiagnosticReportKind.Full,
		items: diagnostics,
	} satisfies DocumentDiagnosticReport;
});

documents.onDidChangeContent(async (change) => {
	debouncedValidateTextDocument(change.document);
});

function createLanguageProvider(
	languageId: string,
	settings: ExtensionSettings
): LanguageProvider {
	let provider: LanguageProvider | undefined;

	switch (languageId) {
		case "javascript":
		case "typescript":
			provider = new JavascriptAndTypescriptProvider(
				languageId,
				connection,
				settings
			);
			break;
		case "python":
			provider = new PythonProvider(languageId, connection, settings);
			break;
		default:
			provider = undefined;
			break;
	}
	if (!provider) throw new Error(`Unsupported language: ${languageId}`);
	return provider;
}

function getOrCreateProvider(
	languageId: string,
	settings: ExtensionSettings
): LanguageProvider {
	if (!providerCache[languageId]) {
		providerCache[languageId] = createLanguageProvider(languageId, settings);
	}
	return providerCache[languageId];
}

async function validateTextDocument(
	textDocument: TextDocument
): Promise<Diagnostic[]> {
	const languageId = textDocument.languageId;

	// TODO: we can optimize this later by using cached settings
	const settings = await getDocumentSettings(textDocument.uri);
	const provider = getOrCreateProvider(languageId, settings);
	let diagnostics = await provider.getDiagnostic(textDocument.uri);

	if (!diagnostics || provider.isDiagnosticsOutdated(textDocument)) {
		diagnostics = await provider.provideDiagnostics(textDocument);
		provider.setDiagnostic(textDocument.uri, textDocument.version, diagnostics);
	}
	return diagnostics;
}

const debouncedValidateTextDocument = debounce(async (document) => {
	return await validateTextDocument(document);
}, 1000);

connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
	params.changes.forEach((change) => {
		console.log(`${change.uri} has changed: ${change.type}`);

		if (change.uri.includes("/api/") || change.uri.includes("/views/")) {
			// TODO: ensure files have corresponding tests
			console.log("Checking for tests");
		}
	});
});

connection.onCodeAction(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) return;
	const settings = await getDocumentSettings(document.uri);
	const languageId = document.languageId;
	const provider = getOrCreateProvider(languageId, settings);
	const actions = await provider.provideCodeActions(document);
	return actions;
});

connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		return [
			{
				label: "TypeScript",
				kind: CompletionItemKind.Text,
				data: 1,
			},
			{
				label: "JavaScript",
				kind: CompletionItemKind.Text,
				data: 2,
			},
		];
	}
);

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
	if (item.data === 1) {
		item.detail = "TypeScript details";
		item.documentation = "TypeScript documentation";
	} else if (item.data === 2) {
		item.detail = "JavaScript details";
		item.documentation = "JavaScript documentation";
	}
	return item;
});

connection.onExecuteCommand((params) => {
	if (params.command !== FIX_NAME || params.arguments === undefined) {
		return;
	}

	const textDocument = documents.get(params.arguments[0]);
	const newName = params.arguments[1];
	const range = params.arguments[2];
	if (
		textDocument === undefined ||
		newName === undefined ||
		range === undefined
	) {
		console.error(
			"Invalid arguments! Expected PARAMS = URI, NAME, Range",
			textDocument,
			newName,
			range
		);
		return;
	}

	connection.workspace.applyEdit({
		documentChanges: [
			TextDocumentEdit.create(
				{ uri: textDocument.uri, version: textDocument.version },
				[TextEdit.replace(range, newName)]
			),
		],
	});
});

documents.listen(connection);
connection.listen();
