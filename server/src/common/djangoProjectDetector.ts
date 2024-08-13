import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { Connection, WorkspaceFolder } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

export type ModelCache = Map<string, { fields: Record<string, string>, relationships: Record<string, any> }>;

interface ModelInfo {
    fields: Record<string, string>;
    relationships: Record<string, any>;
}

export class DjangoProjectDetector {
    private static DJANGO_INDICATORS = [
        'manage.py',
        'django-admin.py',
        'settings.py',
        'urls.py',
        'wsgi.py',
        'asgi.py'
    ];

    private static DJANGO_IMPORT_PATTERNS = [
        'from django',
        'import django',
        'from rest_framework',
        'import rest_framework'
    ];

    private static excludedDirs: Set<string> = new Set(['venv', 'env', 'node_modules', '.git', '__pycache__']);
    private static modelCache: ModelCache = new Map();

    static async analyzeProject(projectUri: string, connection: Connection): Promise<void> {
        if (this.isDjangoProject(projectUri)) {
            connection.console.log('Starting Django project analysis...');
            const projectPath = URI.parse(projectUri).fsPath;
            await this.scanFolder(projectPath, connection);
            connection.console.log('Django project analysis completed.');
        }
    }

    private static async scanFolder(folderPath: string, connection: Connection): Promise<void> {
        const files = await fs.promises.readdir(folderPath);

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            const stats = await fs.promises.stat(filePath);

            if (stats.isDirectory()) {
                if (!this.isExcludedDirectory(file)) {
                    await this.scanFolder(filePath, connection);
                }
            } else if (file.endsWith('.py')) {
                await this.analyzeFile(filePath, connection);
            }
        }
    }

    private static isExcludedDirectory(dirName: string): boolean {
        return this.excludedDirs.has(dirName) || dirName.includes('site-packages');
    }

    private static async analyzeFile(filePath: string, connection: Connection): Promise<void> {
        if (filePath.includes('migrations')) {
            return;
        }

        const content = await fs.promises.readFile(filePath, 'utf-8');
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

    private static isDjangoModelFile(document: TextDocument): boolean {
        const text = document.getText();
        return text.includes('from django.db import models') || text.includes('import models');
    }

    private static extractModelInfo(modelContent: string): ModelInfo {
        const fields: Record<string, string> = {};
        const relationships: Record<string, any> = {};

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

    private static extractFieldProperties(propsString: string): Record<string, string> {
        const props: Record<string, string> = {};
        const propsRegex = /(\w+)\s*=\s*([^,)]+)/g;
        let propMatch;
        while ((propMatch = propsRegex.exec(propsString)) !== null) {
            const [, propName, propValue] = propMatch;
            props[propName] = propValue.trim();
        }
        return props;
    }

    static isDjangoProject(projectUri: string): boolean {
        try {
            const projectPath = URI.parse(projectUri).fsPath;
            
            for (const indicator of this.DJANGO_INDICATORS) {
                if (this.fileExists(path.join(projectPath, indicator))) {
                    return true;
                }
            }

            const pythonFiles = this.getPythonFiles(projectPath);
            for (const file of pythonFiles) {
                if (this.fileContainsDjangoImports(file)) {
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error(`Error detecting Django project: ${error}`);
            return false;
        }
    }

    private static fileExists(filePath: string): boolean {
        try {
            return fs.existsSync(filePath);
        } catch (error) {
            console.error(`Error checking file existence: ${error}`);
            return false;
        }
    }

    private static getPythonFiles(dir: string): string[] {
        try {
            const files: string[] = [];
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    files.push(...this.getPythonFiles(fullPath));
                } else if (entry.isFile() && path.extname(entry.name) === '.py') {
                    files.push(fullPath);
                }
            }

            const filteredFiles = files.filter(file => !file.includes('venv'));
            return filteredFiles;
        } catch (error) {
            console.error(`Error getting Python files: ${error}`);
            return [];
        }
    }

    private static fileContainsDjangoImports(filePath: string): boolean {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return this.DJANGO_IMPORT_PATTERNS.some(pattern => content.includes(pattern));
        } catch (error) {
            console.error(`Error reading file: ${error}`);
            return false;
        }
    }

    static isDjangoPythonFile(fileUri: string): boolean {
        try {
            const filePath = URI.parse(fileUri).fsPath;
            return this.fileContainsDjangoImports(filePath);
        } catch (error) {
            console.error(`Error checking Django Python file: ${error}`);
            return false;
        }
    }

    static getModelInfo(modelName: string): ModelInfo | undefined {
        return this.modelCache.get(modelName);
    }

    static getAllModels(): Map<string, ModelInfo> {
        return this.modelCache;
    }

    static getModelCount(): number {
        return this.modelCache.size;
    }
}