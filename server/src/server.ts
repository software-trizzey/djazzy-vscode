import projectPackageJson from "../../package.json";

import {
	createConnection,
	TextDocuments,
	Diagnostic,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
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
	DiagnosticSeverity,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import {
	LanguageProvider,
	JavascriptAndTypescriptProvider,
	PythonProvider,
} from "./providers";
import {
	ExtensionSettings,
	defaultConventions,
	normalizeClientSettings,
	incrementSettingsVersion,
	setWorkspaceRoot,
	updateCachedUserToken,
	cachedUserToken,
} from "./settings";
import { checkForTestFile, debounce, getWordRangeAt } from "./utils";

import COMMANDS, { COMMANDS_LIST } from "./constants/commands";
import { rollbar } from "./common/logs";
import { SOURCE_NAME } from './constants/diagnostics';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);
const providerCache: Record<string, LanguageProvider> = {};

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const extensionNameMessage = `Extension Name: ${projectPackageJson.name}`;
	const extensionVersionMessage = `Extension Version: ${projectPackageJson.version}`;

	if (process.env.NODE_ENV !== "production") {
		console.log(extensionNameMessage);
		console.log(extensionVersionMessage);
	} else {
		rollbar.info(extensionNameMessage);
		rollbar.info(extensionVersionMessage);
	}
	console.log(`Running Node.js version: ${process.version}`);

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
			renameProvider: true,
			executeCommandProvider: {
				commands: COMMANDS_LIST,
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

connection.onInitialized(async () => {
	const settings = await getDocumentSettings("N/A");
	const routeId = "server#index";
	const workspaceFolders = await connection.workspace.getWorkspaceFolders();
	setWorkspaceRoot(workspaceFolders);

	if (!settings.general.isDevMode || process.env.NODE_ENV === "production") {
		rollbar.configure({
			logLevel: "warning",
			payload: {
				environment: "production",
				context: routeId,
			},
		});
	} else {
		rollbar.configure({
			logLevel: "debug",
			payload: { environment: "development", context: routeId },
		});
	}

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

	console.log(
		`Finished Initializing server at: ${new Date().toLocaleTimeString()}`
	);
});

let globalSettings: ExtensionSettings = defaultConventions;
const documentSettings: Map<string, Thenable<ExtensionSettings>> = new Map();

connection.onDidChangeConfiguration(async (change) => {
	incrementSettingsVersion();

	const collectedDocuments = documents.all();
	if (hasConfigurationCapability) {
		documentSettings.clear();
		await Promise.all(
			collectedDocuments.map(async (document) => {
				const settings = await getDocumentSettings(document.uri.toString());
				documentSettings.set(
					document.uri.toString(),
					Promise.resolve(settings)
				);
			})
		);
	} else {
		globalSettings = <ExtensionSettings>(
			(change.settings.whenInRome || defaultConventions)
		);
	}
	console.log("Settings have changed. Refreshing diagnostics...");
	await Promise.all(
		collectedDocuments.map(async (document) => {
			const diagnostics = await validateTextDocument(document);
			connection.sendDiagnostics({
				uri: document.uri,
				diagnostics,
			});
		})
	);
});

function getDocumentSettings(resource: string): Thenable<ExtensionSettings> {
	if (!hasConfigurationCapability || resource === "N/A") {
		return Promise.resolve(globalSettings);
	}
	let settingsResult = documentSettings.get(resource);
	if (!settingsResult) {
		settingsResult = connection.workspace
			.getConfiguration({
				scopeUri: resource,
				section: "whenInRome",
			})
			.then((settings) => normalizeClientSettings(settings));
		documentSettings.set(resource, settingsResult);
	}
	return settingsResult;
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
		case "javascriptreact":
		case "typescriptreact":
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
	provider.updateSettings(settings);
	let diagnostics = await provider.getDiagnostic(
		textDocument.uri,
		textDocument.version
	) || [];

	console.info(`Validating file: ${textDocument.uri}`, {
		context: "server#validateTextDocument",
	});

	const diagnosticsOutdated = !diagnostics || provider.isDiagnosticsOutdated(textDocument);
	if (diagnosticsOutdated) {
		provider.deleteDiagnostic(textDocument.uri);
        provider.clearDiagnostics(textDocument.uri);

		diagnostics = await provider.provideDiagnostics(textDocument);
	}
	return diagnostics;
}

const debouncedValidateTextDocument = debounce(
	async (document: TextDocument) => {
		return await validateTextDocument(document);
	},
	2000
);

connection.onRequest(COMMANDS.CHECK_TESTS_EXISTS, async (relativePath: string) => {
    const testExists = await checkForTestFile(relativePath);
    return { testExists };
});

connection.onRequest(COMMANDS.UPDATE_CACHED_USER_TOKEN, (token: string) => {
	updateCachedUserToken(token);
  });

connection.onCodeAction(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) return;
	const settings = await getDocumentSettings(document.uri);
	const languageId = document.languageId;
	const provider = getOrCreateProvider(languageId, settings);

	if (!cachedUserToken) {
		throw new Error('User is not authenticated. Token not found.');
	}

	const actions = await provider.provideCodeActions(document, cachedUserToken);
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
	if (params.command !== COMMANDS.FIX_NAME || params.arguments === undefined) {
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

connection.onRequest(COMMANDS.APPLY_RENAME_SYMBOL, async (params) => {
	const { textDocument, newName, references } = params;
	const document = documents.get(textDocument.uri);
	if (!document) return;

	const changes = [];

	for (const ref of references) {
		const refDocument = documents.get(ref.uri);
		if (!refDocument) continue;
		const refWordRange = getWordRangeAt(refDocument, ref.range.start);
		changes.push(TextEdit.replace(refWordRange, newName));
	}

	const edit = {
		documentChanges: [
		TextDocumentEdit.create(
			{ uri: textDocument.uri, version: document.version },
			changes
		),
		],
	};

	return edit;
});

connection.onRequest(COMMANDS.PROVIDE_RENAME_SUGGESTIONS, async (params) => {
	if (!cachedUserToken) {
		throw new Error('User is not authenticated. Token not found.');
	}

	const { textDocument, position } = params;
	const document = documents.get(textDocument.uri);
	if (!document) return [];

	const settings = await getDocumentSettings(document.uri);
	const languageId = document.languageId;
	const provider = getOrCreateProvider(languageId, settings);

	const wordRange = getWordRangeAt(document, position);
	const oldName = document.getText(wordRange);

	let diagnostics = provider.getDiagnostic(textDocument.uri, document.version);
	let diagnostic = diagnostics?.find(diag => diag.range.start.line === wordRange.start.line && diag.range.start.character === wordRange.start.character);

	if (!diagnostic) {
		diagnostic = {
		range: wordRange,
		message: `The symbol "${oldName}" does not follow naming conventions.`,
		severity: DiagnosticSeverity.Warning,
		source: SOURCE_NAME,
		};

		diagnostics = diagnostics || [];
		diagnostics.push(diagnostic);
		provider.setDiagnostic(textDocument.uri, document.version, diagnostics);
	}

	const suggestions = await provider.generateNameSuggestions(document, diagnostic, cachedUserToken);
	return suggestions.map(suggestion => ({
		label: suggestion.suggestedName,
		detail: suggestion.justification
	}));
});

documents.listen(connection);
connection.listen();
