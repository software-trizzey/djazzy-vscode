import { CodeAction, Connection, Diagnostic } from 'vscode-languageserver/node';
import { CommentAnalyzer } from '../services/analysis';
import { DiagnosticsManager } from '../services/diagnostics';
import { ErrorHandler } from '../services/error';
import { CodeContextExtractor } from '../services/extraction';
import { LLMInteractionManager } from '../services/llm';
import { NameValidator } from '../services/validation';
import { defaultConventions, ExtensionSettings } from '../settings';
import { BaseProvider } from './base';
import { TextDocument } from 'vscode-languageserver-textdocument';


export abstract class LanguageProvider extends BaseProvider {
    protected diagnosticsManager: DiagnosticsManager;
    protected nameValidator: NameValidator;
    protected commentAnalyzer: CommentAnalyzer;
    protected codeContextExtractor: CodeContextExtractor;
    protected llmInteractionManager: LLMInteractionManager;
    protected errorHandler: ErrorHandler;

    constructor(
        protected languageId: keyof typeof defaultConventions.languages,
        connection: Connection,
        settings: ExtensionSettings,
		document: TextDocument
    ) {
        super(connection, settings);
        this.diagnosticsManager = new DiagnosticsManager();
        this.nameValidator = new NameValidator(this.getConventions(), settings);
        this.commentAnalyzer = new CommentAnalyzer();
        this.codeContextExtractor = new CodeContextExtractor(document);
        this.llmInteractionManager = new LLMInteractionManager(connection);
        this.errorHandler = new ErrorHandler(connection);
    }

    public abstract provideDiagnostics(document: TextDocument): Promise<Diagnostic[]>;
    protected abstract runDiagnostics(document: TextDocument, diagnostics: Diagnostic[], changedLines: Set<number> | undefined): Promise<Diagnostic[]>;
    abstract generateFixForNamingConventionViolation(document: TextDocument, diagnostic: Diagnostic, userToken: string): Promise<CodeAction | undefined>;
    abstract provideCodeActions(document: TextDocument, userToken: string): Promise<CodeAction[]>;
}