import { Connection } from "vscode-languageserver/node";


import { ExtensionSettings } from "../settings";

export abstract class BaseProvider {
    protected connection: Connection;
    protected settings: ExtensionSettings;

    constructor(connection: Connection, settings: ExtensionSettings) {
        this.connection = connection;
        this.settings = settings;
        console.log("BaseProvider constructor settings", this.settings);
    }

    public abstract getSettings(): ExtensionSettings;
    public abstract updateSettings(settings: ExtensionSettings): void;
}