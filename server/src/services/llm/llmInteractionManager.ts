import { Connection, Diagnostic } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Models } from '../../llm/types';

export class LLMInteractionManager {
    private connection: Connection;

    constructor(connection: Connection) {
        this.connection = connection;
    }

    public async fetchSuggestedNameFromLLM(params: {
        flaggedName: string;
        message: string;
        modelId: Models;
        document: TextDocument;
        diagnostic: Diagnostic;
        userToken: string;
        functionBody?: string;
    }): Promise<{
        originalName: string;
        suggestedName: string;
        justification: string;
    } | null> {
        return null;
    }
}