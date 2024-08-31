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
	CompletionItem,
    CompletionItemKind,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import {
	LanguageProvider,
	DjangoProvider,
	PythonProvider,
	FunctionDetails,
} from "./providers";
import {
	ExtensionSettings,
	defaultConventions,
	normalizeClientSettings,
	incrementSettingsVersion,
	setWorkspaceRoot,
	updateCachedUserToken,
	cachedUserToken,
	updatePythonExecutablePath,
} from "./settings";
import { checkForTestFile, debounce } from "./utils";
import { checkForPythonAndVenv } from './utils/checkForPython';

import { DiagnosticQueue } from "./services/diagnostics";

import COMMANDS, { COMMANDS_LIST, DJANGOLY_ID } from "./constants/commands";
import LOGGER, { rollbar } from "./common/logs";
import { SOURCE_NAME } from './constants/diagnostics';
import { API_SERVER_URL } from './constants/api';

const connection = createConnection(ProposedFeatures.all);
const providerCache: Record<string, LanguageProvider> = {};
const pythonProviderCache: Record<string, PythonProvider> = {};
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const diagnosticQueue = new DiagnosticQueue();


let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const extensionNameMessage = `Extension Name: ${projectPackageJson.name}`;
	const extensionVersionMessage = `Extension Version: ${projectPackageJson.version}`;

	console.log(extensionNameMessage);
	console.log(extensionVersionMessage);
	console.log(`Running Node.js version: ${process.version}`);

    const pythonEnv = checkForPythonAndVenv();
    if (!pythonEnv) {
        const errorMessage = 'Python environment setup failed. Ensure that Python is installed and the virtual environment is bundled correctly.';
        connection.console.error(errorMessage);
        throw new Error(errorMessage);
    } else {
		updatePythonExecutablePath(pythonEnv.pythonExecutable);
	}

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
				codeActionKinds: [CodeActionKind.QuickFix, CodeActionKind.RefactorRewrite],
			},
			executeCommandProvider: {
				commands: COMMANDS_LIST,
			},
			completionProvider: {
                resolveProvider: true
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
	const workspaceFolders = await connection.workspace.getWorkspaceFolders() || [];
	setWorkspaceRoot(workspaceFolders);

	const logContext = {
		routeId,
		extensionVersion: projectPackageJson.version,
		vscode: { extension: DJANGOLY_ID },
	};

	if (process.env.NODE_ENV !== "development" || !!process.env.NODE_ENV) {
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
	provider.useDiagnosticManager().deleteDiagnostic(documentUri);
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
	textDocument: TextDocument,
	workspaceFolders: WorkspaceFolder[] | null
): LanguageProvider {
	let provider: LanguageProvider | undefined;

	switch (languageId) {
		case "python":
            provider = new DjangoProvider(languageId, connection, settings, textDocument);
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
	textDocument: TextDocument,
	workspaceFolders: WorkspaceFolder[] | null
): LanguageProvider {
	if (!providerCache[languageId]) {
		providerCache[languageId] = createLanguageProvider(languageId, settings, textDocument, workspaceFolders);
	}
	return providerCache[languageId];
}

export async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	return await diagnosticQueue.queueDiagnosticRequest(textDocument, async (document) => {
		const languageId = document.languageId;
		const settings = await getDocumentSettings(document.uri);
		const workspaceFolders = await connection.workspace.getWorkspaceFolders();
		const provider = getOrCreateProvider(languageId, settings, textDocument, workspaceFolders);
		provider.updateSettings(settings);
		
		const diagnosticsManager = provider.useDiagnosticManager();

		let diagnostics = await diagnosticsManager.getDiagnostic(
			document.uri,
			document.version
		) || [];

		console.info(`Validating file: ${document.uri}`, {
			context: "server#validateTextDocument",
		});

		const diagnosticsOutdated = !diagnostics || diagnosticsManager.isDiagnosticsOutdated(document);
		if (diagnosticsOutdated) {
			diagnosticsManager.deleteDiagnostic(document.uri);
			diagnosticsManager.clearDiagnostics(document.uri);

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


connection.onRequest(COMMANDS.PROVIDE_EXCEPTION_HANDLING, async (params) => {
    const { functionName, lineNumber, uri } = params;
    const document = documents.get(uri);

    if (!document) {
        return [];
    }
    const functionNode = await findFunctionInDocument(document, functionName, lineNumber);

    if (!functionNode) {
        return [];
    }

	const payload = {
        functionCode: functionNode.raw_body,
        args: functionNode.args,
        decorators: functionNode.decorators,
        imports: functionNode.context.imports,
        callSites: functionNode.context.call_sites,
        returns: functionNode.returns,
        apiKey: "test-key-2" // TODO: use actual api key from user cache settings
    };

    const suggestions = await generateExceptionHandlingSuggestions(payload);

    const completionItems = suggestions.map((suggestion, index) => {
        const item = CompletionItem.create(`Suggestion ${index + 1}`);
        item.kind = CompletionItemKind.Snippet;
        item.insertText = suggestion;
        item.detail = `Exception handling suggestion ${index + 1}`;
        return item;
    });
    return { completionItems, functionNode };
});

async function findFunctionInDocument(document: TextDocument, functionName: string, lineNumber: number): Promise<FunctionDetails | null> {
	const settings = await getDocumentSettings(document.uri);
	const languageId = document.languageId;
	if (languageId !== 'python') {
		console.log("File is not a Python document. Skipping function extraction.");
		return null;
	}
	const provider = new PythonProvider(languageId, connection, settings, document);
	const functionNode = await provider.findFunctionNode(document, functionName, lineNumber);
    return functionNode;
}

async function generateExceptionHandlingSuggestions(payload: any): Promise<string[]> {
    const url = 'http://localhost:8000/chat/refactor/'; // TODO: use the API_SERVER_URL

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            if (response.status === 403) {
                console.error(`Forbidden: Invalid API key for ${url}`);
                return [];
            } else if (response.status === 429) {
                console.error(`Too Many Requests: Rate limit exceeded for ${url}`);
                return [];
            } else if (response.status === 500) {
                console.error(`Server Error: Internal server error on ${url}`);
                return [];
            } else {
                console.error(`Error in API call to ${url}: ${response.statusText} (HTTP ${response.status})`);
                return [];
            }
        }

        let responseData: any;
        try {
            responseData = await response.json();
        } catch (jsonError: any) {
            console.error(`Error parsing JSON response from ${url}: ${jsonError.message}`);
            return [];
        }

        if (!responseData || !Array.isArray(responseData.refactoredFunctions)) {
            console.error(`Error in API call to ${url}: Invalid response data`);
            return [];
        }

        return responseData.refactoredFunctions;
    } catch (error: any) {
        console.error(`Network error in API call to ${url}: ${error.message}`);
        return [];
    }
}
  

connection.onCodeAction(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) return;
	
	const settings = await getDocumentSettings(document.uri);
	const languageId = document.languageId;
	const workspaceFolders = await connection.workspace.getWorkspaceFolders();
	const provider = getOrCreateProvider(languageId, settings, document, workspaceFolders);

	const actions = await provider.provideCodeActions(document, '');
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
                const provider = getOrCreateProvider(document.languageId, settings, document, workspaceFolders);
				provider.useDiagnosticManager().reportFalsePositive(document, diagnostic);
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
