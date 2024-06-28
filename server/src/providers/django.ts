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
	}
}