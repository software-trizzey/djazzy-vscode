import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { Connection, WorkspaceFolder } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

export type ModelCache = Map<string, { fields: Record<string, string>, relationships: Record<string, any>, parent_models: string[] }>;

interface ModelInfo {
    fields: Record<string, string>;
    relationships: Record<string, any>;
    parent_models: string[];
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
    private static projectRoot: string | null = null;
    private static workspaceFolders: WorkspaceFolder[] | null = null;

    static async analyzeProject(fileUri: string, connection: Connection): Promise<boolean> {
        const filePath = URI.parse(fileUri).fsPath;
        this.projectRoot = await this.findProjectRoot(filePath);
        const workspaceFolders = await connection.workspace.getWorkspaceFolders() ?? [];
        this.workspaceFolders = workspaceFolders;

        if (!this.projectRoot) {
            connection.console.log('Unable to determine project root.');
            return false;
        }

        if (await this.isDjangoProject(this.projectRoot)) {
            connection.console.log('Starting Django project analysis...');
            await this.scanFolder(this.projectRoot, connection);
            connection.console.log('Django project analysis completed.');
            return true;
        }

        connection.console.log('Not a Django project.');
        return false;
    }

    private static async findProjectRoot(startPath: string): Promise<string | null> {
        let currentPath = startPath;
        let depth = 0;
        const MAX_DEPTH = 5;
        
        while (currentPath !== path.parse(currentPath).root && depth < MAX_DEPTH) {
            if (await this.isFile(currentPath)) {
                currentPath = path.dirname(currentPath);
                continue;
            }

            if (await this.isProjectRoot(currentPath)) {
                return currentPath;
            }
            
            if (await this.isBoundaryDirectory(currentPath)) {
                return null;
            }
            
            if (this.isWorkspaceRoot(currentPath)) {
                return null;
            }
            
            currentPath = path.dirname(currentPath);
            depth++;
        }
        
        return null;
    }

    private static async isFile(path: string): Promise<boolean> {
        try {
            const stats = await fs.promises.stat(path);
            return stats.isFile();
        } catch (error) {
            console.error(`Error checking if path is a file: ${error}`);
            return false;
        }
    }

    private static async isProjectRoot(dirPath: string): Promise<boolean> {
        try {
            if (await this.isFile(dirPath)) {
                return false;
            }
            const files = await fs.promises.readdir(dirPath);
            return files.some(file => 
                this.DJANGO_INDICATORS.includes(file) || 
                file === 'pyproject.toml' || 
                file === 'setup.py' ||
                file === 'requirements.txt'
            );
        } catch (error) {
            console.error(`Error checking project root: ${error}`);
            return false;
        }
    }

    private static async isBoundaryDirectory(dirPath: string): Promise<boolean> {
        try {
            if (await this.isFile(dirPath)) {
                return false;
            }
            const files = await fs.promises.readdir(dirPath);
            return files.includes('.git') || files.includes('node_modules');
        } catch (error) {
            console.error(`Error checking boundary directory: ${error}`);
            return false;
        }
    }

    private static async isDjangoProject(projectRoot: string): Promise<boolean> {
        const files = await fs.promises.readdir(projectRoot);
        
        for (const indicator of this.DJANGO_INDICATORS) {
            if (files.includes(indicator)) {
                return true;
            }
        }

        const pythonFiles = await this.getPythonFiles(projectRoot);
        for (const file of pythonFiles) {
            if (await this.fileContainsDjangoImports(file)) {
                return true;
            }
        }

        return false;
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

    private static async analyzeFile(filePath: string, connection: Connection): Promise<void> {
        if (filePath.includes('migrations')) {
            return;
        }

        const content = await fs.promises.readFile(filePath, 'utf-8');
        const document = TextDocument.create(`file://${filePath}`, 'python', 1, content);

        if (!this.isDjangoModelFile(document)) {
            return;
        }

        const modelRegex = /class\s+(\w+)\(([\w.,\s]*)\):[\s\S]*?(?=\n\S|$)/g;
        const text = document.getText();
        let match;
        while ((match = modelRegex.exec(text)) !== null) {
            const modelName = match[1];
            const parentModels = match[2].split(',').map(model => model.trim());
            const modelContent = match[0];
            const modelInfo = this.extractModelInfo(modelContent, parentModels);
            this.modelCache.set(modelName, modelInfo);
        }
    }

    private static extractModelInfo(modelContent: string, parentModels: string[]): ModelInfo {
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

        return { fields, relationships, parent_models: parentModels };
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
   
    private static async getPythonFiles(dir: string): Promise<string[]> {
        const files: string[] = [];
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && !this.isExcludedDirectory(entry.name)) {
                files.push(...await this.getPythonFiles(fullPath));
            } else if (entry.isFile() && path.extname(entry.name) === '.py') {
                files.push(fullPath);
            }
        }

        return files;
    }

    private static async fileContainsDjangoImports(filePath: string): Promise<boolean> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return this.DJANGO_IMPORT_PATTERNS.some(pattern => content.includes(pattern));
        } catch (error) {
            console.error(`Error reading file: ${error}`);
            return false;
        }
    }

    private static isDjangoModelFile(document: TextDocument): boolean {
        const text = document.getText();
        return text.includes('from django.db import models') || text.includes('import models');
    }

    private static isExcludedDirectory(dirName: string): boolean {
        return this.excludedDirs.has(dirName) || dirName.includes('site-packages');
    }

    static async isDjangoPythonFile(fileUri: string): Promise<boolean> {
        try {
            const filePath = URI.parse(fileUri).fsPath;
            return await this.fileContainsDjangoImports(filePath);
        } catch (error) {
            console.error(`Error checking Django Python file: ${error}`);
            return false;
        }
    }

    private static isWorkspaceRoot(dirPath: string): boolean {
        return this.workspaceFolders?.some(folder => 
            URI.parse(folder.uri).fsPath === dirPath
        ) ?? false;
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

    static getProjectRoot(): string | null {
        return this.projectRoot;
    }

    static getWorkspaceFolders(): WorkspaceFolder[] | null {
        return this.workspaceFolders;
    }
}