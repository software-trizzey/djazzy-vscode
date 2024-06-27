import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
	Connection,
} from "vscode-languageserver/node";

import { PythonProvider } from "./python";
import { SOURCE_NAME, NAMING_CONVENTION_VIOLATION_SOURCE_TYPE } from "../constants/diagnostics";
import { RULE_MESSAGES } from '../constants/rules';
import { ExtensionSettings, defaultConventions } from "../settings";

interface DjangoUrlPattern {
    type: string;
    name: string;
    line: number;
	end_col_offset: number;
    value: string;
}

interface ParsedUrlPattern {
    type: string;
    args: string[];
    line: number;
    col_offset: number;
}


export class DjangoProvider extends PythonProvider {
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
        changedLines: Set<number> | undefined
    ): Promise<void> {
        await super.validateAndCreateDiagnostics(symbols, diagnostics, changedLines);

        try {
            for (const symbol of symbols) {
                if (symbol.type === 'django_url_pattern') {
                    const result = this.validateURLPattern(symbol);

                    if (result.violates) {
                        const start = { line: symbol.line, character: symbol.col_offset };
                        const end = { line: symbol.line, character: symbol.end_col_offset };
                        const range = Range.create(start, end);
                        const diagnostic: Diagnostic = {
                            range,
                            message: result.reason,
                            severity: DiagnosticSeverity.Warning,
                            source: SOURCE_NAME,
                            code: NAMING_CONVENTION_VIOLATION_SOURCE_TYPE
						};
						diagnostics.push(diagnostic);
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing symbols:', error);
            const errorDiagnostic: Diagnostic = {
                range: Range.create(0, 0, 0, 1),
                message: `Error parsing Django URL patterns: ${error}`,
                severity: DiagnosticSeverity.Error,
                source: SOURCE_NAME
            };
            diagnostics.push(errorDiagnostic);
        }
    }

    private validateURLPattern(pattern: DjangoUrlPattern): { violates: boolean; reason: string } {
        try {
            const parsedValue = JSON.parse(pattern.value.replace(/'/g, '"')) as ParsedUrlPattern;
            const patternType = parsedValue.type;
            const patternString = parsedValue.args[0];
            const patternName = parsedValue.args[1];
            
            // Rule 1: Avoid hardcoded URLs
            if (patternString.startsWith('http://') || patternString.startsWith('https://')) {
                return { violates: true, reason: RULE_MESSAGES.URL_PATTERN_HARDCODED };
            }

            // Rule 2: Use named URL patterns
            if (!patternName) {
                return { violates: true, reason: RULE_MESSAGES.URL_PATTERN_UNNAMED };
            }

            // Rule 3: Avoid regex in URL patterns when possible
            if (patternType === 're_path' || patternType === 'url') {
                return { violates: true, reason: RULE_MESSAGES.URL_PATTERN_REGEX };
            }

            // Rule 4: Use angle brackets for URL parameters
            if (patternString.includes('<') && !patternString.includes('>')) {
                return { violates: true, reason: RULE_MESSAGES.URL_PATTERN_INVALID_PARAMETER };
            }

            // Rule 5: Consistent use of trailing slashes
            if (!patternString.endsWith('/') && !patternString.includes('<')) {
                return { violates: true, reason: RULE_MESSAGES.URL_PATTERN_INCONSISTENT_TRAILING_SLASH };
			}

            return { violates: false, reason: '' };
        } catch (error) {
            console.error('Error parsing URL pattern value:', error);
            return { violates: true, reason: `Error parsing URL pattern: ${error}` };
        }
    }
}