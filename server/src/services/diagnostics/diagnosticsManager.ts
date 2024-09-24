import { Connection, Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Severity } from '../../llm/types';
import { cachedUserToken, settingsVersion } from '../../settings';
import { NAMING_CONVENTION_VIOLATION_SOURCE_TYPE, SOURCE_NAME } from '../../constants/diagnostics';
import LOGGER from '../../common/logs';
import { DJANGOLY_DOCS_URL, RuleCodes } from '../../constants/rules';


interface NPlusOneQueryResult {
    issue: string;
    location: {
        start: { line: number; column: number };
        end: { line: number; column: number };
    };
    recommendation?: string;
    code_example?: string;
}


export class DiagnosticsManager {
    private diagnostics: Map<string, {
        diagnostics: Diagnostic[];
        documentVersion: number;
        settingsVersion: number;
    }> = new Map();

    private connection: Connection;

    constructor(connection: Connection) {
        this.connection = connection;
    }

	public getDiagnostic(
		documentUri: string,
		documentVersion: number
	): Diagnostic[] | undefined {
		const entry = this.diagnostics.get(documentUri);
		if (
			entry &&
			entry.settingsVersion === settingsVersion &&
			entry.documentVersion === documentVersion
		) {
			return entry.diagnostics;
		}
		return undefined;
	}

	public setDiagnostic(
		documentUri: string,
		documentVersion: number,
		diagnostics: Diagnostic[]
	): void {
		this.diagnostics.set(documentUri, {
			diagnostics,
			documentVersion,
			settingsVersion,
		});
	}

    public createDiagnostic(
        range: Range,
        message: string,
        severity: DiagnosticSeverity,
        sourceType = NAMING_CONVENTION_VIOLATION_SOURCE_TYPE,
        linkToReferenceDocs: string = DJANGOLY_DOCS_URL
    ): Diagnostic {
        const diagnostic: Diagnostic = {
            range,
            message,
            severity,
            source: SOURCE_NAME,
            code: sourceType,
            codeDescription: {
                href: linkToReferenceDocs
            }
        };
        return diagnostic;
    }

	public isDiagnosticCached(documentUri: string): boolean {
		return this.diagnostics.has(documentUri);
	}

	public deleteDiagnostic(documentUri: string): void {
		this.diagnostics.delete(documentUri);
	}

	public isDiagnosticsOutdated(document: TextDocument): boolean {
		const cacheEntry = this.diagnostics.get(document.uri);
		return (
			!cacheEntry ||
			cacheEntry.settingsVersion !== settingsVersion ||
			cacheEntry.documentVersion !== document.version
		);
	}

	public clearDiagnostics(uri: string) {
		this.connection.sendDiagnostics({ uri, diagnostics: [] });
	}

    public getMinScoreForSeverity(severity: Severity): number {
        switch (severity) {
            case Severity.ERROR:
                return 90;
            case Severity.WARNING:
                return 60;
            case Severity.INFORMATION:
                return 30;
            case Severity.HINT:
            default:
                return 0;
        }
    }

    public getSeverityIndicator(severity: DiagnosticSeverity): string {
        switch (severity) {
            case DiagnosticSeverity.Error:
                return '🛑';
            case DiagnosticSeverity.Warning:
                return '🔶';
            case DiagnosticSeverity.Information:
                return 'ℹ️';
            case DiagnosticSeverity.Hint:
                return '💡';
            default:
                return '•';
        }
    }

    public reportFalsePositive(document: TextDocument, diagnostic: Diagnostic): void {
        const diagnosticId = (diagnostic.data as { id: string }).id;
        LOGGER.info(`False positive reported`, {
            userId: cachedUserToken,
            diagnosticId: diagnosticId,
            timestamp: new Date().toISOString()
        });
        // TODO: Additional logic for handling false positive reports
    }

    public formatNPlusOneDiagnosticMessage(result: NPlusOneQueryResult): string {
        let message = `🚨 N+1 Issue Detected (${RuleCodes.NPLUSONE}):\n`;
        message += `${result.issue}\n\n`;
    
        message += `Recommendation:\n`;
        message += "Try optimizing your query using `select_related()` or `prefetch_related()` to reduce the number of queries.\n\n";
        return message;
    }
}