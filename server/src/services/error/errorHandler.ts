import { Connection } from 'vscode-languageserver/node';


export class ErrorHandler {
    private connection: Connection;

    constructor(connection: Connection) {
        this.connection = connection;
    }

    public handleError(error: Error): void {
        // Implementation...
    }
}