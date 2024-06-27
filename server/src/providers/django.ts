import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
    Position,
	Connection,
} from "vscode-languageserver/node";

import { PythonProvider } from "./python";
import { SOURCE_NAME, NAMING_CONVENTION_VIOLATION_SOURCE_TYPE } from "../constants/diagnostics";
import { RULE_MESSAGES } from '../constants/rules';
import { ExtensionSettings, defaultConventions } from "../settings";



export class DjangoProvider extends PythonProvider {
    constructor(
        languageId: keyof typeof defaultConventions.languages,
        connection: Connection,
        settings: ExtensionSettings
    ) {
        super(languageId, connection, settings);
    }

    private validateURLPattern(pattern: any): { violates: boolean; reason: string } {
        const patternString = pattern.args[0];
        
        // Rule 1: Avoid hardcoded URLs
        if (patternString.startsWith('http://') || patternString.startsWith('https://')) {
            return { violates: true, reason: RULE_MESSAGES.URL_PATTERN_HARDCODED };
        }

        // Rule 2: Use named URL patterns
        if (!pattern.args[1] || typeof pattern.args[1] !== 'string') {
            return { violates: true, reason: RULE_MESSAGES.URL_PATTERN_UNNAMED };
        }

        // Rule 3: Avoid regex in URL patterns when possible
        if (pattern.type === 're_path' || pattern.type === 'url') {
            return { violates: true, reason: RULE_MESSAGES.URL_PATTERN_REGEX };
        }

        // Rule 4: Use angle brackets for URL parameters
        if (patternString.includes('<') && !patternString.includes('>')) {
            return { violates: true, reason: RULE_MESSAGES.URL_PATTERN_INVALID_PARAMETER };
        }

        return { violates: false, reason: '' };
    }

    async validateAndCreateDiagnostics(
        symbols: any[],
        diagnostics: Diagnostic[],
        changedLines: Set<number> | undefined
    ): Promise<void> {
        await super.validateAndCreateDiagnostics(symbols, diagnostics, changedLines);

        for (const symbol of symbols) {
            if (symbol.type === 'django_url_pattern') {
                const pattern = JSON.parse(symbol.value);
                const result = this.validateURLPattern(pattern);

                if (result.violates) {
                    const start = Position.create(symbol.line, symbol.col_offset);
                    const end = Position.create(symbol.line, symbol.end_col_offset);
                    const range = Range.create(start, end);
                    const diagnostic: Diagnostic = Diagnostic.create(
                        range,
                        result.reason,
                        DiagnosticSeverity.Warning,
                        NAMING_CONVENTION_VIOLATION_SOURCE_TYPE,
                        SOURCE_NAME
                    );
                    diagnostics.push(diagnostic);
                }
            }
        }
    }
}