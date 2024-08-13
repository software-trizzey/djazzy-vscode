import { Diagnostic } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';


export class DiagnosticsManager {
    private diagnostics: Map<string, {
        diagnostics: Diagnostic[];
        documentVersion: number;
        settingsVersion: number;
    }> = new Map();

    public getDiagnostic(documentUri: string, documentVersion: number): Diagnostic[] | undefined {
        return;
    }

    public setDiagnostic(documentUri: string, documentVersion: number, diagnostics: Diagnostic[]): void {
        return;
    }

    public isDiagnosticCached(documentUri: string): boolean {
        return false;
    }

    public deleteDiagnostic(documentUri: string): void {
        return;
    }

    public isDiagnosticsOutdated(document: TextDocument): boolean {
        return false;
    }

    public clearDiagnostics(uri: string): void {
        return;
    }
}