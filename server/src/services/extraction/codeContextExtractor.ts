
import { Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';


export class CodeContextExtractor {
    private document: TextDocument;

    constructor(document: TextDocument) {
        this.document = document;
    }

    public extractFunctionBody(range: Range): string {
        return "TODO: Implement this method";
    }

    public limitFunctionBodySize(functionBody: string, maxLength: number = 1000): string {
        return "TODO: Implement this method";
    }

    public getFunctionBodyRange(functionRange: Range): Range {
        return Range.create(0, 0, 0, 0);
    }

    public getSurroundingCode(range: Range): string {
        return "TODO: Implement this method";
    }
}
