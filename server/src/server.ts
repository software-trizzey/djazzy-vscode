import projectPackageJson from "../../package.json";

import {
	createConnection,
	TextDocuments,
	Diagnostic,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CodeActionKind,
	TextEdit,
	TextDocumentSyncKind,
	TextDocumentEdit,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport,
	WorkspaceFolder,
	ShowMessageNotification,
	MessageType,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import {
	LanguageProvider,
	PythonProvider,
	DjangoProvider,
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
import { checkForTestFile, debounce, DjangoProjectDetector } from "./utils";
import { DjangoProjectAnalyzer } from './common/djangoProjectAnalyzer';

import COMMANDS, { COMMANDS_LIST } from "./constants/commands";
import LOGGER, { rollbar } from "./common/logs";
import { SOURCE_NAME } from './constants/diagnostics';

class DiagnosticQueue {
	private queues: Map<string, Promise<Diagnostic[]>> = new Map();
  
	async queueDiagnosticRequest(
		document: TextDocument,
		diagnosticFunction: (document: TextDocument) => Promise<Diagnostic[]>
	): Promise<Diagnostic[]> {
		const uri = document.uri;

		const diagnosticPromise = (async () => {
			await this.queues.get(uri);
			return await diagnosticFunction(document);
		})();

		// Replace any existing promise in the queue with this new one
		this.queues.set(uri, diagnosticPromise);
		return await diagnosticPromise;
	}

	clearQueue(uri: string) {
		this.queues.delete(uri);
	}
}

const connection = createConnection(ProposedFeatures.all);
const providerCache: Record<string, LanguageProvider> = {};
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const diagnosticQueue = new DiagnosticQueue();
let djangoProjectAnalyzer: DjangoProjectAnalyzer | null = null;


let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const extensionNameMessage = `Extension Name: ${projectPackageJson.name}`;
	const extensionVersionMessage = `Extension Version: ${projectPackageJson.version}`;

	console.log(extensionNameMessage);
	console.log(extensionVersionMessage);
	console.log(`Running Node.js version: ${process.version}`);

	const capabilities = params.capabilities;

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
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false,
			},
			codeActionProvider: {
				codeActionKinds: [CodeActionKind.QuickFix],
			},
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
	const routeId = "server#index";
	const workspaceFolders = await connection.workspace.getWorkspaceFolders();
	setWorkspaceRoot(workspaceFolders);

	const logContext = {
		routeId,
		extensionVersion: projectPackageJson.version,
	};

	if (process.env.NODE_ENV !== "development") {
		rollbar.configure({
			logLevel: "warning",
			payload: { environment: "production", context: logContext },
		});
	} else {
		rollbar.configure({
			logLevel: "debug",
			payload: { environment: "development", context: logContext },
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

	if (workspaceFolders) {
        const isDjangoProject = workspaceFolders.some(folder => {
            try {
                return DjangoProjectDetector.isDjangoProject(folder.uri);
            } catch (error) {
                console.error(`Error detecting Django project: ${error}`);
                return false;
            }
        });

        if (isDjangoProject) {
            console.log('Django project detected. Starting project analysis...');
            djangoProjectAnalyzer = new DjangoProjectAnalyzer(connection, workspaceFolders);
            await djangoProjectAnalyzer.analyzeProject();
            console.log('Django project analysis completed.');
			console.log(`Found ${djangoProjectAnalyzer.getModelCount()} models in the project.`, djangoProjectAnalyzer.getAllModels());
        }
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
			(change.settings.djangoly || defaultConventions)
		);
	}
	console.log("Settings have changed. Refreshing diagnostics...");

	for (const languageId in providerCache) {
		const provider = providerCache[languageId];
		const settings = await getDocumentSettings('N/A'); // Use global settings
		provider.updateConfiguration(settings);
	}

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
				section: SOURCE_NAME,
			})
			.then((settings) => normalizeClientSettings(settings));
		documentSettings.set(resource, settingsResult);
	}
	return settingsResult;
}

documents.onDidChangeContent((change) => {
	debouncedValidateTextDocument(change.document);
});

documents.onDidClose((e) => {
	diagnosticQueue.clearQueue(e.document.uri);
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


function createLanguageProvider(
	languageId: string,
	settings: ExtensionSettings,
	workspaceFolders: WorkspaceFolder[] | null
): LanguageProvider {
	let provider: LanguageProvider | undefined;

	switch (languageId) {
		case "python":
            if (workspaceFolders) {
                const isDjangoProject = workspaceFolders.some(folder => {
                    try {
                        return DjangoProjectDetector.isDjangoProject(folder.uri);
                    } catch (error) {
                        console.error(`Error detecting Django project: ${error}`);
                        return false;
                    }
                });
                if (isDjangoProject) {
                    provider = new DjangoProvider(languageId, connection, settings);
                } else {
                    provider = new PythonProvider(languageId, connection, settings);
                }
            } else {
                provider = new PythonProvider(languageId, connection, settings);
            }
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
	settings: ExtensionSettings,
	workspaceFolders: WorkspaceFolder[] | null
): LanguageProvider {
	if (!providerCache[languageId]) {
		providerCache[languageId] = createLanguageProvider(languageId, settings, workspaceFolders);
	}
	return providerCache[languageId];
}

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	return await diagnosticQueue.queueDiagnosticRequest(textDocument, async (document) => {
		const languageId = document.languageId;
		const settings = await getDocumentSettings(document.uri);
		const workspaceFolders = await connection.workspace.getWorkspaceFolders();
		const provider = getOrCreateProvider(languageId, settings, workspaceFolders);
		provider.updateSettings(settings);

		let diagnostics = await provider.getDiagnostic(
			document.uri,
			document.version
		) || [];

		console.info(`Validating file: ${document.uri}`, {
			context: "server#validateTextDocument",
		});

		const diagnosticsOutdated = !diagnostics || provider.isDiagnosticsOutdated(document);
		if (diagnosticsOutdated) {
			provider.deleteDiagnostic(document.uri);
			provider.clearDiagnostics(document.uri);

			diagnostics = await provider.provideDiagnostics(document);
		}
		return diagnostics;
	});
}

const debouncedValidateTextDocument = debounce(
	async (document: TextDocument) => {
		return await validateTextDocument(document);
	},
	1000
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
	const workspaceFolders = await connection.workspace.getWorkspaceFolders();
	const provider = getOrCreateProvider(languageId, settings, workspaceFolders);

	if (!cachedUserToken) {
		throw new Error('User is not authenticated. Token not found.');
	}

	const actions = await provider.provideCodeActions(document, cachedUserToken);
	return actions;
});


connection.onExecuteCommand(async (params) => {
    if (params.command === COMMANDS.REPORT_FALSE_POSITIVE) {
        const [uri, diagnostic] = params.arguments || [];
        if (uri && diagnostic) {
            const document = documents.get(uri);
            if (document) {
                const settings = await getDocumentSettings(uri);
                const workspaceFolders = await connection.workspace.getWorkspaceFolders();
                const provider = getOrCreateProvider(document.languageId, settings, workspaceFolders);
				provider.reportFalsePositive(document, diagnostic);
				connection.sendNotification(ShowMessageNotification.type, {
                    type: MessageType.Info,
                    message: 'Thank you for reporting this false positive. Our team will review it.'
                });
            }
        }
        return;
    }

	if (params.command === COMMANDS.FIX_NAME && params.arguments !== undefined) {
		LOGGER.info(`User ${cachedUserToken} triggered quick fix rename command.`);
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
	}
});


documents.listen(connection);
connection.listen();
