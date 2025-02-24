import projectPackageJson from "../../package.json";

import * as path from "path";
import { ResponseError } from 'vscode-languageserver';
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
	CancellationTokenSource
} from "vscode-languageserver/node";
import { URI } from "vscode-uri";

import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocumentChangeEvent } from 'vscode-languageserver';
import {
	LanguageProvider,
	DjangoProvider,
} from "./providers";
import {
	ExtensionSettings,
	normalizeClientSettings,
	incrementSettingsVersion,
	setWorkspaceRoot,
	updateCachedUserToken,
	cachedUserToken,
	updatePythonExecutablePath,
	workspaceRoot,
} from "./settings";

import { checkForTestFile } from './lib/checkForTestFile';
import { debounce } from './lib/debounce';
import { getPythonExecutable } from './lib/checkForPython';
import { findFunctionNode, FunctionDetails } from './lib/getPythonFunctionNode';

import { DiagnosticQueue } from "./services/diagnostics";

import COMMANDS, { ACCESS_FORBIDDEN_NOTIFICATION_ID, COMMANDS_LIST, RATE_LIMIT_NOTIFICATION_ID } from "./constants/commands";
import { SOURCE_NAME } from './constants/diagnostics';
import { API_SERVER_URL } from './constants/api';
import { ERROR_CODES, ForbiddenError, RateLimitError  } from './constants/errors';
import { TELEMETRY_EVENTS } from '../../shared/constants';
import { reporter, initializeTelemetry } from './telemetry';
import { getCachedUrls, initializeCache } from './lib/cacheUtils';


const connection = createConnection(ProposedFeatures.all);
const serverReporter = initializeTelemetry(connection);
const providerCache: Record<string, LanguageProvider> = {};
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

	const workspaceFolders = params.workspaceFolders || [];
	setWorkspaceRoot(workspaceFolders);
	const projectRoot = workspaceFolders[0]?.uri || '';
	console.log(`Project root: ${projectRoot}`);

	const pythonCheckResult = getPythonExecutable(projectRoot);
	if (pythonCheckResult.error) {
		connection.console.error(pythonCheckResult.error);
		throw new Error(pythonCheckResult.error);
	} else if (pythonCheckResult.executable) {
		console.log(`Using Python executable: ${pythonCheckResult.executable}`);
		updatePythonExecutablePath(pythonCheckResult.executable);
	} else {
		// NOTE: This branch should theoretically never be hit due to the logic, 
		// but it's good to handle all cases to satisfy TypeScript.
		const errorMessage = 'Unexpected error: Python executable is null without an error message.';
		connection.console.error(errorMessage);
		throw new Error(errorMessage);
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
				triggerCharacters: ["r", "e", "v", "d", "i", "(", '"'],
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
	serverReporter.sendTelemetryEvent(TELEMETRY_EVENTS.SERVER_STARTED);

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

	initializeCache().then(() => {
		console.log("Djazzy cache initialized successfully");
	}).catch((error) => {
		console.error("Failed to initialize Djazzy cache:", error);
	});

	console.log(
		`Finished Initializing server at: ${new Date().toLocaleTimeString()}`
	);
});

let globalSettings: ExtensionSettings;
const documentSettings: Map<string, Promise<ExtensionSettings>> = new Map();

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
			(change.settings.djazzy || null)
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

function getDocumentSettings(resource: string): Promise<ExtensionSettings> {
	if (!hasConfigurationCapability || resource === "N/A") {
		if (!globalSettings) {
			globalSettings = {} as ExtensionSettings;
		}
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
	// Invalidate the cache for this document when its content changes
	const documentUri = change.document.uri;
	cache.forEach((_value, key) => {
		if (key.startsWith(documentUri)) {
			cache.delete(key);
		}
	});

	debouncedValidateTextDocument(change.document);
});

documents.onDidClose((e) => {
	diagnosticQueue.clearQueue(e.document.uri);
	const documentUri = e.document.uri;
	const provider = providerCache[e.document.languageId];
	documentSettings.delete(documentUri);
	provider.useDiagnosticManager().deleteDiagnostic(documentUri);
	openedDocuments.delete(e.document.uri);
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
            provider = new DjangoProvider(connection, settings, textDocument);
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

export async function validateTextDocument(textDocument: TextDocument, includeNPlusOne: boolean = false): Promise<Diagnostic[]> {
    connection.sendDiagnostics({
        uri: textDocument.uri,
        diagnostics: []
    });
    
    return await diagnosticQueue.queueDiagnosticRequest(textDocument, async (document) => {
        const languageId = document.languageId;
        const settings = await getDocumentSettings(document.uri);
        const workspaceFolders = await connection.workspace.getWorkspaceFolders();
        const provider = getOrCreateProvider(languageId, settings, textDocument, workspaceFolders);
        provider.updateSettings(settings);
        
        const diagnostics = await provider.provideDiagnostics(document, includeNPlusOne);
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
	console.log(`Updating cached user token: ${token}`);
	updateCachedUserToken(token);
});


const cache = new Map<string, { functionNode: FunctionDetails, suggestions: string[] }>();
let lastTokenSource: CancellationTokenSource | undefined;


connection.onRequest(COMMANDS.PROVIDE_EXCEPTION_HANDLING, async (params) => {
    if (!cachedUserToken) {
        throw new ResponseError(
			ERROR_CODES.UNAUTHENTICATED,
			'User is not authenticated. Token not found.',
			{ code: ERROR_CODES.UNAUTHENTICATED }
		);
    }
	reporter.sendTelemetryEvent(
		TELEMETRY_EVENTS.EXCEPTION_HANDLING_TRIGGERED,
		{
			user: cachedUserToken,
		}
	);

    const { functionName, lineNumber, uri } = params;
    const document = documents.get(uri);

    if (!document) {
        return [];
    }

	const cacheKey = `${uri}-${functionName}-${lineNumber}`;
	const cachedData = cache.get(cacheKey);
    if (cachedData) {
        console.log('Using cached data for suggestions');
        return {
            completionItems: cachedData.suggestions.map((suggestion: any, index) => {
                const item = CompletionItem.create(suggestion.title || `Suggestion ${index + 1}`);
                item.kind = CompletionItemKind.Snippet;
                item.insertText = suggestion.variation;
                item.detail = suggestion.title ? `Refactored version: ${suggestion.title}` : `Exception handling suggestion ${index + 1}`;
                return item;
            }),
            functionNode: cachedData.functionNode
        };
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
    };

	if (lastTokenSource) {
		console.log('Cancelling previous server request', lastTokenSource.token.isCancellationRequested);
		lastTokenSource.cancel();
	}

	lastTokenSource = new CancellationTokenSource();
    const suggestions = await generateExceptionHandlingSuggestions(payload, cachedUserToken);

    const completionItems = suggestions.map((suggestion: any, index) => {
        const item = CompletionItem.create(suggestion.title || `Suggestion ${index + 1}`);
        item.kind = CompletionItemKind.Snippet;
        item.insertText = suggestion.variation;
        item.detail = suggestion.title ? `Refactored version: ${suggestion.title}` : `Exception handling suggestion ${index + 1}`;
        return item;
    });

	cache.set(cacheKey, { functionNode, suggestions });
    return { completionItems, functionNode };
});

async function findFunctionInDocument(document: TextDocument, functionName: string, lineNumber: number): Promise<FunctionDetails | null> {
	const languageId = document.languageId;
	if (languageId !== 'python') {
		console.log("File is not a Python document. Skipping function extraction.");
		return null;
	}
	const functionNode = await findFunctionNode(document, functionName, lineNumber);
    return functionNode;
}

async function generateExceptionHandlingSuggestions(payload: any, sessionToken: string): Promise<string[]> {
    const url = `${API_SERVER_URL}/chat/refactor/`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
				'X-Session-Token': sessionToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            if (response.status === ERROR_CODES.UNAUTHENTICATED) {
                throw new ForbiddenError('User is not authenticated. Token not found.');
            } else if (response.status === 429) {
                throw new RateLimitError('Daily request limit exceeded. Please try again tomorrow.');
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
        if (error instanceof RateLimitError) {
            connection.sendNotification(RATE_LIMIT_NOTIFICATION_ID, {
                message: error.message,
            });
        } else if (error instanceof ForbiddenError) {
			connection.sendNotification(ACCESS_FORBIDDEN_NOTIFICATION_ID, {
                message: error.message,
            });
		} else {
			throw error;
		}
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
				provider.useDiagnosticManager().reportFalsePositive(diagnostic);
				connection.sendNotification(ShowMessageNotification.type, {
                    type: MessageType.Info,
                    message: 'Thank you for reporting this false positive. Our team will review it.'
                });
            }
        }
        return;
    }

	if (params.command === COMMANDS.FIX_NAME && params.arguments !== undefined) {
		if (cachedUserToken) {
			reporter.sendTelemetryEvent(
				TELEMETRY_EVENTS.QUICK_FIX_TRIGGERED,
				{
					user: cachedUserToken,
				}
			);
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
	}
});

const openedDocuments = new Set<string>();

documents.onDidOpen(async (event: TextDocumentChangeEvent<TextDocument>) => {
    const document = event.document;
    
    if (!openedDocuments.has(document.uri)) {
        openedDocuments.add(document.uri);
        try {
            const diagnostics = await validateTextDocument(document, true);
            connection.sendDiagnostics({ uri: document.uri, diagnostics });
        } catch (error: any) {
            const errorMessage = typeof error === 'string' ? error : error.message || 'Unknown error';
            console.error('Error during document open diagnostics:', errorMessage);
            connection.sendNotification(ShowMessageNotification.type, {
                type: MessageType.Error,
                message: `Error running diagnostics on document open: ${errorMessage}`
            });
        }
    }
});

connection.onCompletion(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    const cachedUrls = getCachedUrls(workspaceRoot);

    if (cachedUrls.length === 0) {
        return [];
    }

    const position = params.position;
    const lineText = document.getText().split("\n")[position.line].trim();
	
    const triggerRegex = /(?:^|\s)(?:return\s+)?(reverse|redirect)\s*\(\s*["']?/;
	if (!triggerRegex.test(lineText)) {
		console.log("No URL trigger words found");
		return [];
	}

	console.log("Trigger matched! Providing suggestions");

	const completionItems = cachedUrls.map(({ url_name, file_path }) => {
		const item = CompletionItem.create(url_name);
		item.kind = CompletionItemKind.Text;
		item.insertText = `"${url_name}"`;
		item.detail = "Valid URL name from your project";
		const fileUri = URI.file(path.join(workspaceRoot, file_path)).toString();

		item.documentation = {
			kind: "markdown",
			value: `**Django URL Pattern:** \`${url_name}\`\n\n👨‍🏫 **Defined in:** [\`${file_path}\`](${fileUri})`
		};
	
		return item;
	});
    return completionItems;
});


documents.listen(connection);
connection.listen();
