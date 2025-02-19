import { CodeAction, Connection, Diagnostic, MessageType, ShowMessageRequestParams } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { BaseProvider } from './base';

import { DiagnosticsManager } from '../services/diagnostics';
import { ErrorHandler } from '../services/error';
import { ExtensionSettings } from '../settings';


export abstract class LanguageProvider extends BaseProvider {
    protected diagnosticsManager: DiagnosticsManager;
    protected errorHandler: ErrorHandler;

    constructor(
      connection: Connection,
      settings: ExtensionSettings
    ) {
      super(connection, settings);
      this.diagnosticsManager = new DiagnosticsManager(connection);
      this.errorHandler = new ErrorHandler(connection);
    }

    public abstract provideDiagnostics(document: TextDocument, isOnSave: boolean): Promise<Diagnostic[]>;
    protected abstract runDiagnostics(document: TextDocument, diagnostics: Diagnostic[], changedLines: Set<number> | undefined): Promise<Diagnostic[]>;
    abstract provideCodeActions(document: TextDocument, userToken: string): Promise<CodeAction[]>;

    public useDiagnosticManager() {
      return this.diagnosticsManager;
    }

    public getSettings() {
      return this.settings;
    }

    public updateConfiguration(updatedSettings: ExtensionSettings): void {
      this.settings = updatedSettings;
    }

    private sendNotSupportedMessage(languageId: string): void {
      const messageParams: ShowMessageRequestParams = {
        type: MessageType.Warning,
        message: `The language ${languageId} is not currently supported by Djazzy extension.`,
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