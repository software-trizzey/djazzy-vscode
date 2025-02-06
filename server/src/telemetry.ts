import { TELEMETRY_NOTIFICATION } from '../../shared/constants';
import { Connection } from 'vscode-languageserver/node';

class ServerTelemetry {
    private connection: Connection;
    
    constructor(connection: Connection) {
        this.connection = connection;
    }

    sendTelemetryEvent(eventName: string, properties?: { [key: string]: string }) {
        // Send telemetry data to client via custom notification
        this.connection.sendNotification(TELEMETRY_NOTIFICATION.EVENT, {
            eventName,
            properties,
            timestamp: new Date().toISOString()
        });
        
        // Also log locally for debugging
        console.log(`[Server Telemetry] ${eventName}`, properties || '');
    }
}

let reporter: ServerTelemetry;

export function initializeTelemetry(connection: Connection) {
    reporter = new ServerTelemetry(connection);
    return reporter;
}

export { reporter };