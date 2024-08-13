import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { Connection, WorkspaceFolder } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const readFile = util.promisify(fs.readFile);
const readdir = util.promisify(fs.readdir);

export type ModelCache =  Map<string, { fields: Record<string, string>, relationships: Record<string, any> }>;

interface ModelInfo {
    fields: Record<string, string>;
    relationships: Record<string, any>;
}

export class DjangoProjectAnalyzer {
    private connection: Connection;
    private workspaceFolders: WorkspaceFolder[];
    private modelCache: ModelCache = new Map();
    private excludedDirs: Set<string> = new Set(['venv', 'env', 'node_modules', '.git', '__pycache__']);

    constructor(connection: Connection, workspaceFolders: WorkspaceFolder[]) {
        this.connection = connection;
        this.workspaceFolders = workspaceFolders;
    }

    async analyzeProject(): Promise<void> {
        this.connection.console.log('Starting Django project analysis...');
        for (const folder of this.workspaceFolders) {
            await this.scanFolder(folder.uri);
        }
        this.connection.console.log('Django project analysis completed.');
    }

    private async scanFolder(folderUri: string): Promise<void> {
        const folderPath = folderUri.replace('file://', '');
        const files = await readdir(folderPath);

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            const stats = await fs.promises.stat(filePath);

            if (stats.isDirectory()) {
                if (!this.isExcludedDirectory(file)) {
                    await this.scanFolder(`file://${filePath}`);
                }
            } else if (file.endsWith('.py')) {
                await this.analyzeFile(filePath);
            }
        }
    }

    private isExcludedDirectory(dirName: string): boolean {
        return this.excludedDirs.has(dirName) || dirName.includes('site-packages');
    }

    private async analyzeFile(filePath: string): Promise<void> {
        if (filePath.includes('migrations')) {
            return;
        }

        const content = await readFile(filePath, 'utf-8');
        const document = TextDocument.create(`file://${filePath}`, 'python', 1, content);

        if (!this.isDjangoModelFile(document)) {
            return;
        }

        const modelRegex = /class\s+(\w+)\(.*models\.Model.*\):[\s\S]*?(?=\n\S|$)/g;
        const text = document.getText();
        let match;
        while ((match = modelRegex.exec(text)) !== null) {
            const modelName = match[1];
            const modelContent = match[0];
            const modelInfo = this.extractModelInfo(modelContent);
            this.modelCache.set(modelName, modelInfo);
        }
    }

    private isDjangoModelFile(document: TextDocument): boolean {
        const text = document.getText();
        return text.includes('from django.db import models') || text.includes('import models');
    }

    private extractModelInfo(modelContent: string): any {
        const fields: any = {};
        const relationships: any = {};

        const fieldRegex = /(\w+)\s*=\s*models\.(\w+)(?:\(|$|\s)/g;
        let fieldMatch;
        while ((fieldMatch = fieldRegex.exec(modelContent)) !== null) {
            const [, fieldName, fieldType] = fieldMatch;
            if (['ForeignKey', 'OneToOneField', 'ManyToManyField'].includes(fieldType)) {
                relationships[fieldName] = { type: fieldType };
            } else {
                fields[fieldName] = fieldType;
            }
        }

        const relationshipPropsRegex = /(\w+)\s*=\s*models\.(ForeignKey|OneToOneField|ManyToManyField)\s*\(([\s\S]*?)\)/g;
        let relationshipPropsMatch;
        while ((relationshipPropsMatch = relationshipPropsRegex.exec(modelContent)) !== null) {
            const [, fieldName, fieldType, props] = relationshipPropsMatch;
            relationships[fieldName] = {
                type: fieldType,
                properties: this.extractFieldProperties(props)
            };
        }

        return { fields, relationships };
    }

    private extractFieldProperties(propsString: string): any {
        const props: any = {};
        const propsRegex = /(\w+)\s*=\s*([^,)]+)/g;
        let propMatch;
        while ((propMatch = propsRegex.exec(propsString)) !== null) {
            const [, propName, propValue] = propMatch;
            props[propName] = propValue.trim();
        }
        return props;
    }

    getModelInfo(modelName: string): ModelInfo | undefined {
        return this.modelCache.get(modelName);
    }

    getAllModels(): Map<string, ModelInfo> {
        return this.modelCache;
    }

    getModelCount(): number {
        return this.modelCache.size;
    }
}