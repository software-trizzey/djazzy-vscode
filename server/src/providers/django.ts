import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
    Connection,
	CodeAction,
	CodeActionKind,
} from "vscode-languageserver/node";
import { TextDocument } from 'vscode-languageserver-textdocument';

import { createHash } from 'crypto';

import { PythonProvider } from "./python";
import { SOURCE_NAME, DJANGO_NPLUSONE_VIOLATION_SOURCE_TYPE, DJANGO_SECURITY_VIOLATION_SOURCE_TYPE, NAMING_CONVENTION_VIOLATION_SOURCE_TYPE } from "../constants/diagnostics";
import { ExtensionSettings, cachedUserToken, defaultConventions } from "../settings";
import LOGGER from '../common/logs';
import COMMANDS, { ACCESS_FORBIDDEN_NOTIFICATION_ID, RATE_LIMIT_NOTIFICATION_ID } from '../constants/commands';
import { Issue, Severity } from '../llm/types';


interface CachedResult {
    diagnostics: Diagnostic[];
    timestamp: number;
}

const FIVE_MINUTES = 5 * 60 * 1000;

export class DjangoProvider extends PythonProvider {

    private nPlusOnecache: Map<string, CachedResult> = new Map();
    private cacheTTL: number = FIVE_MINUTES;

    constructor(
        languageId: keyof typeof defaultConventions.languages,
        connection: Connection,
        settings: ExtensionSettings
    ) {
        super(languageId, connection, settings);
    }

    async validateAndCreateDiagnostics(
        symbols: any[],
        diagnostics: Diagnostic[],
        changedLines: Set<number> | undefined,
        securityIssues: any[],
        nplusOneIssues: any[],
        document: TextDocument
    ): Promise<void> {
        const cacheKey = this.generateCacheKey(document.getText(), document);
    
        const cachedResult = this.getCachedResult(cacheKey);
        if (cachedResult) {
            console.log("Using cached result for Django diagnostics");
            diagnostics.push(...cachedResult.diagnostics);
            return;
        }
    
        await super.validateAndCreateDiagnostics(symbols, diagnostics, changedLines, securityIssues, nplusOneIssues, document);
        
        this.processDjangoSecurityIssues(securityIssues, diagnostics);
        this.processNPlusOneIssues(nplusOneIssues, diagnostics);
    
        this.setCachedResult(cacheKey, diagnostics);
    }    

	public async provideCodeActions(document: TextDocument, userToken: string): Promise<CodeAction[]> {
		const diagnostics = document.uri
			? this.getDiagnostic(document.uri, document.version)
			: [];

		if (!diagnostics) return [];

        const codeActions: CodeAction[] = [];
		for (const diagnostic of diagnostics) {
            if (diagnostic.message.includes("exceeds the maximum length of")) continue;

			if (diagnostic.code === NAMING_CONVENTION_VIOLATION_SOURCE_TYPE) {
				const fix = await this.generateFixForNamingConventionViolation(
					document,
					diagnostic,
					userToken
				);
				if (fix) {
					codeActions.push(fix);
				}
			} else if (diagnostic.code === DJANGO_NPLUSONE_VIOLATION_SOURCE_TYPE) {
                const actions = this.getNPlusOneDiagnosticActions(document, diagnostic);
                codeActions.push(...actions);
            }
		}

        const filteredActions = codeActions.filter(action => action !== undefined);
		return filteredActions;
	}

	protected getNPlusOneDiagnosticActions(document: TextDocument, diagnostic: Diagnostic): CodeAction[] {
		const actions: CodeAction[] = [];

		if (diagnostic.code === DJANGO_NPLUSONE_VIOLATION_SOURCE_TYPE) {
			const title = 'Report as false positive';
			const reportAction = CodeAction.create(
				title,
				{
					title: title,
					command: COMMANDS.REPORT_FALSE_POSITIVE,
					arguments: [document.uri, diagnostic]
				},
				CodeActionKind.QuickFix
			);
			reportAction.diagnostics = [diagnostic];
			reportAction.isPreferred = true;
			actions.push(reportAction);
		}

		return actions;
	}

    private processDjangoSecurityIssues(
        securityIssues: any[],
        diagnostics: Diagnostic[],
    ): void {
        for (const issue of securityIssues) {
            const range: Range = {
                start: { line: issue.line - 1, character: 0 },
                end: { line: issue.line - 1, character: Number.MAX_VALUE }
            };

            const severity = this.mapSeverity(issue.severity);

            const diagnostic: Diagnostic = {
                range,
                message: issue.message,
                severity: severity,
                source: SOURCE_NAME,
                code: DJANGO_SECURITY_VIOLATION_SOURCE_TYPE,
                codeDescription: {
                    href: issue.doc_link
                }
            };

            diagnostics.push(diagnostic);
        }
    }

    private processNPlusOneIssues(
        issues: any[],
        diagnostics: Diagnostic[],
        changedLines?: Set<number>
    ): void {
        const uniqueIssues = new Map<string, any>();
        console.log(`Detected ${issues.length} N+1 issues`, issues);
    
        for (const issue of issues) {
            // TODO: uncomment this line if (!this.shouldShowIssue(issue.score)) continue;
    
            const issueLine = issue.line - 1;
            
            if (changedLines && changedLines.has(issueLine)) {
                console.log(`Skipping N+1 issue at line ${issueLine} due to change`);
                continue;
            }
    
            const issueKey = `${issue.problematic_code}-${issue.line}`;
    
            const existingIssue = uniqueIssues.get(issueKey);
            if (!existingIssue || issue.score > existingIssue.score) {
                uniqueIssues.set(issueKey, issue);
            }
        }
    
        for (const issue of uniqueIssues.values()) {
            const issueLine = issue.line - 1;
            const range: Range = {
                start: { line: issueLine, character: issue.col_offset || 0 },
                end: { line: issueLine, character: issue.end_col_offset || Number.MAX_VALUE },
            };
    
            const severity = this.mapSeverity(issue.severity || Severity.WARNING);
            const diagnosticMessage = this.createStructuredDiagnosticMessage(issue, severity);
            
            const diagnostic: Diagnostic = {
                range,
                message: diagnosticMessage,
                severity: severity,
                source: SOURCE_NAME,
                code: DJANGO_NPLUSONE_VIOLATION_SOURCE_TYPE,
                codeDescription: {
                    href: 'https://docs.djangoproject.com/en/stable/topics/db/optimization/',
                },
                data: {
                    id: issue.id,
                    score: issue.score,
                    contextualInfo: issue.contextual_info,
                },
            };
    
            diagnostics.push(diagnostic);
        }
    
        console.log(`Processed ${uniqueIssues.size} unique N+1 issues out of ${issues.length} total issues`);
    }
    
    private sendRateLimitNotification(): void {
        this.connection.sendNotification(RATE_LIMIT_NOTIFICATION_ID, {
            message: "Daily limit for N+1 query detection has been reached. Your quota for this feature will reset tomorrow."
        });
    }
    
    private sendForbiddenNotification(): void {
        this.connection.sendNotification(ACCESS_FORBIDDEN_NOTIFICATION_ID, {
            message: "You do not have permission to use the N+1 query detection feature. Please check your authentication."
        });
    }

    private generateCacheKey(documentText: string, document: TextDocument): string {
        const normalizedText = documentText || "";
        const functionBodyHash = createHash('md5').update(normalizedText).digest('hex');
        return `${document.uri}:${functionBodyHash}`;
    }
    
    private getCachedResult(key: string): CachedResult | null {
        const cached = this.nPlusOnecache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached;
        }
        return null;
    }    

    private setCachedResult(key: string, diagnostics: Diagnostic[]): void {
        this.nPlusOnecache.set(key, { diagnostics, timestamp: Date.now() });
    }      

    clearNPlusOneCache(): void {
        this.nPlusOnecache.clear();
        console.log('N+1 query detection cache cleared due to severity threshold change');
    }

    public updateConfiguration(newSettings: ExtensionSettings): void {
        const oldThreshold = this.settings.general.nPlusOneMinimumSeverityThreshold;
        this.settings = newSettings;
    
        if (oldThreshold !== newSettings.general.nPlusOneMinimumSeverityThreshold) {
            this.clearNPlusOneCache();
        }
    }

    private mapSeverity(severity: Severity): DiagnosticSeverity {
        switch (severity) {
            case Severity.ERROR:
                return DiagnosticSeverity.Error;
            case Severity.WARNING:
                return DiagnosticSeverity.Warning;
            case Severity.INFORMATION:
                return DiagnosticSeverity.Information;
            case Severity.HINT:
                return DiagnosticSeverity.Hint;
            default:
                return DiagnosticSeverity.Warning;
        }
    }

    private shouldShowIssue(score: number): boolean {
        const minScore = this.getMinScoreForSeverity(this.settings.general.nPlusOneMinimumSeverityThreshold);
        return score >= minScore;
    }

    private getMinScoreForSeverity(severity: Severity): number {
        switch (severity) {
            case Severity.ERROR:
                return 90;
            case Severity.WARNING:
                return 70;
            case Severity.INFORMATION:
                return 50;
            case Severity.HINT:
            default:
                return 0;
        }
    }

    private getSeverityIndicator(severity: DiagnosticSeverity): string {
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

	public logFalsePositiveFeedback(diagnosticId: string): void {
		LOGGER.info(`False positive reported`, {
			userId: cachedUserToken,
			diagnosticId: diagnosticId,
			timestamp: new Date().toISOString()
		});
	}

	private logError(error: Error, context: string): void {
		LOGGER.error(`Error in N+1 detection: ${context}`, {
			userId: cachedUserToken,
			errorMessage: error.message,
			errorStack: error.stack,
			timestamp: new Date().toISOString()
		});
	}

    private createStructuredDiagnosticMessage(issue: Issue, severity: DiagnosticSeverity): string {
        const severityIndicator = this.getSeverityIndicator(severity);
        let contextInfo = '';
        
        if (issue.contextual_info) {
            const queryType = issue.contextual_info.query_type;
            const relatedField = issue.contextual_info.related_field || 'a queryset';
            
            if (queryType === 'attribute_access') {
                contextInfo = `Detected in ${issue.contextual_info.is_in_loop ? 'a loop' : 'code'} ` +
                              `while accessing the related field "${relatedField}"`;
            } else {
                contextInfo = `Detected in ${issue.contextual_info.is_in_loop ? 'a loop' : 'code'} ` +
                              `using .${queryType}() on ${relatedField}`;
            }
            
            if (issue.contextual_info.is_in_loop) {
                contextInfo += ` (loop starts at line ${issue.contextual_info.loop_start_line})`;
            }
        }
        
        return `${severityIndicator} N+1 Query Detected (Score: ${issue.score})
        \n[Issue]\n${issue.message}
        \n[Context]\n${contextInfo || 'Potential inefficient database query'}\n`;
        // \n[Suggestion]\n${issue.suggestedFix}\n`; FIXME: Add back when we have method for getting suggestions
    }
    

    private clearDiagnosticsForSymbol(symbol: any, diagnostics: Diagnostic[]): void {
        const symbolRange = {
            start: { line: symbol.function_start_line - 1, character: 0 },
            end: { line: symbol.function_end_line - 1, character: Number.MAX_VALUE }
        };
        
        for (let lastIndex = diagnostics.length - 1; lastIndex >= 0; lastIndex--) {
            if (this.isRangeWithin(diagnostics[lastIndex].range, symbolRange)) {
                diagnostics.splice(lastIndex, 1);
            }
        }
    }

    private isRangeWithin(inner: Range, outer: Range): boolean {
        return (inner.start.line >= outer.start.line && inner.end.line <= outer.end.line);
    }
}