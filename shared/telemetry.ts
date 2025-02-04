import TelemetryReporter from '@vscode/extension-telemetry';

const connectionString = 'InstrumentationKey=f7333d9e-51d3-4382-bdfb-a9d52cb9d111;IngestionEndpoint=https://westus-0.in.applicationinsights.azure.com/;LiveEndpoint=https://westus.livediagnostics.monitor.azure.com/;ApplicationId=c0b91bd5-1551-443f-ba58-594c7f663d3b';
let reporter: TelemetryReporter;

export function initializeTelemetry() {
    reporter = new TelemetryReporter(connectionString);
	return reporter;
}

export { reporter };