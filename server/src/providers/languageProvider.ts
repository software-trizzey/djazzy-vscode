import { CodeAction, Connection, Diagnostic, MessageType, ShowMessageRequestParams } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';


import { BaseProvider } from './base';

import { CommentAnalyzer } from '../services/analysis';
import { DiagnosticsManager } from '../services/diagnostics';
import { ErrorHandler } from '../services/error';
import { LLMInteractionManager } from '../services/llm';
import { NameValidator, ThemeValidator } from '../services/validation';
import { defaultConventions, ExtensionSettings } from '../settings';
import { LanguageConventions } from '../languageConventions';


export abstract class LanguageProvider extends BaseProvider {
    protected conventions: LanguageConventions = defaultConventions.languages.python;
    protected diagnosticsManager: DiagnosticsManager;
    protected nameValidator: NameValidator;
    protected themeValidator: ThemeValidator;
    protected commentAnalyzer: CommentAnalyzer;
    protected llmInteractionManager: LLMInteractionManager;
    protected errorHandler: ErrorHandler;

    constructor(
        protected languageId: keyof typeof defaultConventions.languages,
        connection: Connection,
        settings: ExtensionSettings,
		document: TextDocument
    ) {
      super(connection, settings);
      const conventions = this.getConventions();
      this.diagnosticsManager = new DiagnosticsManager(connection);
      this.nameValidator = new NameValidator(conventions, settings);
      this.themeValidator = new ThemeValidator(conventions, settings);
      this.commentAnalyzer = new CommentAnalyzer();
      this.llmInteractionManager = new LLMInteractionManager(connection, conventions);
      this.errorHandler = new ErrorHandler(connection);

      const languageSettings = settings.languages[languageId];
      if (!languageSettings) {
        this.sendNotSupportedMessage(languageId);
        return;
      }
      this.conventions = languageSettings;
    }

    public abstract provideDiagnostics(document: TextDocument, isOnSave: boolean): Promise<Diagnostic[]>;
    protected abstract runDiagnostics(document: TextDocument, diagnostics: Diagnostic[], changedLines: Set<number> | undefined): Promise<Diagnostic[]>;
    abstract generateFixForNamingConventionViolation(document: TextDocument, diagnostic: Diagnostic, userToken: string): Promise<CodeAction | undefined>;
    abstract provideCodeActions(document: TextDocument, userToken: string): Promise<CodeAction[]>;

    public useDiagnosticManager() {
      return this.diagnosticsManager;
    }

    public getSettings() {
      return this.settings;
    }

    public updateConventions(settings: ExtensionSettings): void {
      const languageSettings = settings.languages[this.languageId];
      if (!languageSettings) {
        this.sendNotSupportedMessage(this.languageId);
        return;
      }
      this.conventions = languageSettings;
    }
    public updateConfiguration(updatedSettings: ExtensionSettings): void {
      this.settings = updatedSettings;
      this.updateConventions(updatedSettings);
    }

    private sendNotSupportedMessage(languageId: string): void {
      const messageParams: ShowMessageRequestParams = {
        type: MessageType.Warning,
        message: `The language ${languageId} is not currently supported by Djangoly extension.`,
        actions: [{ title: "Dismiss" }],
      };
      this.connection
        .sendRequest("window/showMessageRequest", messageParams)
        .then((response) => {
          if (response) {
            console.log(`User dismissed the message for ${languageId} support.`);
          }
        });
    }

}