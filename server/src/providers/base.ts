import { Connection } from "vscode-languageserver/node";


import { ExtensionSettings } from "../settings";

import type { LanguageConventions } from "../languageConventions";

export abstract class BaseProvider {
    protected connection: Connection;
    protected settings: ExtensionSettings;

    constructor(connection: Connection, settings: ExtensionSettings) {
        this.connection = connection;
        this.settings = settings;
    }

    protected abstract getConventions(): LanguageConventions;
	protected abstract updateConventions(settings: ExtensionSettings): void;
    public abstract getSettings(): ExtensionSettings;
    public abstract updateSettings(settings: ExtensionSettings): void;
}