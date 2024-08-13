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
import COMMANDS, { ACCESS_FORBIDDEN_NOTIFICATION_ID, IGNORE_DIAGNOSTIC, RATE_LIMIT_NOTIFICATION_ID } from '../constants/commands';
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
            // Report as false positive action
            const reportTitle = 'Report as false positive';
            const reportAction = CodeAction.create(
                reportTitle,
                {
                    title: reportTitle,
                    command: COMMANDS.REPORT_FALSE_POSITIVE,
                    arguments: [document.uri, diagnostic]
                },
                CodeActionKind.QuickFix
            );
            reportAction.diagnostics = [diagnostic];
            reportAction.isPreferred = true;
            actions.push(reportAction);
    
            const ignoreTitle = 'Ignore this diagnostic';
            const ignoreAction = CodeAction.create(
                ignoreTitle,
                {
                    title: ignoreTitle,
                    command: IGNORE_DIAGNOSTIC,
                    arguments: [document.uri, diagnostic]
                },
                CodeActionKind.QuickFix
            );
            ignoreAction.diagnostics = [diagnostic];
            actions.push(ignoreAction);
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
        issues: Issue[],
        diagnostics: Diagnostic[],
        changedLines?: Set<number>
    ): void {
        const uniqueIssues = this.deduplicateIssues(issues);
        console.log(`Detected ${issues.length} N+1 issues, ${uniqueIssues.size} after deduplication`);

        for (const issue of uniqueIssues.values()) {
            if (!this.shouldShowIssue(issue.score)) continue;

            const issueLine = issue.line - 1;
            
            if (changedLines && changedLines.has(issueLine)) {
                console.log(`Skipping N+1 issue at line ${issueLine} due to change`);
                continue;
            }

            const range: Range = {
                start: { line: issueLine, character: issue.col_offset || 0 },
                end: { line: issueLine, character: issue.end_col_offset || Number.MAX_VALUE },
            };

            const severity = this.mapSeverity(issue.severity);
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

        console.log(`Processed ${uniqueIssues.size} unique N+1 issues`);
    }

    private deduplicateIssues(issues: Issue[]): Map<string, Issue> {
        const uniqueIssues = new Map<string, Issue>();

        for (const issue of issues) {
            const issueKey = this.generateIssueKey(issue);
            const existingIssue = uniqueIssues.get(issueKey);

            if (!existingIssue || this.shouldReplaceExistingIssue(existingIssue, issue)) {
                uniqueIssues.set(issueKey, issue);
            }
        }

        return uniqueIssues;
    }

    private generateIssueKey(issue: Issue): string {
        // Create a unique key based on the issue's properties
        return `${issue.line}-${issue.col_offset}-${issue.contextual_info?.query_type}-${issue.contextual_info?.is_in_loop}`;
    }

    /**
    *  Replace if the new issue has a higher score or more detailed information
    */
    private shouldReplaceExistingIssue(existing: Issue, newIssue: Issue): boolean {
        if (newIssue.score > existing.score) return true;
        if (newIssue.score === existing.score && newIssue.message.length > existing.message.length) return true;
        return false;
    }

    private createStructuredDiagnosticMessage(issue: Issue, severity: DiagnosticSeverity): string {
        const severityIndicator = this.getSeverityIndicator(severity);
        const contextInfo = this.generateContextInfo(issue);
        
        return `${severityIndicator} N+1 Query Detected (Score: ${issue.score})
        \n[Issue]\n${issue.message}
        \n[Context]\n${contextInfo}\n`;
    }

    private generateContextInfo(issue: Issue): string {
        if (!issue.contextual_info) return 'Potential inefficient database query';

        const { query_type, related_field, is_in_loop, loop_start_line, is_bulk_operation } = issue.contextual_info;
        const fieldDescription = related_field || 'a queryset';
        let contextInfo = '';

        switch (query_type) {
            case 'attribute_access':
                contextInfo = `Detected while accessing the related field "${fieldDescription}"`;
                break;
            case 'write':
                contextInfo = `Detected while performing a write operation on ${fieldDescription}`;
                break;
            case 'read':
                contextInfo = `Detected while performing a read operation (e.g., filter(), get()) on ${fieldDescription}`;
                break;
            default:
                contextInfo = `Detected using .${query_type}() on ${fieldDescription}`;
        }

        if (is_in_loop) {
            contextInfo += ` in a loop (starts at line ${loop_start_line})`;
        }

        if (is_bulk_operation) {
            contextInfo += ` (Bulk operation detected)`;
        }

        return contextInfo;
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
                return 60;
            case Severity.INFORMATION:
                return 30;
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
}