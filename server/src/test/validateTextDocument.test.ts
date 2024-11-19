import { validateTextDocument } from '../server';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticQueue } from '../services/diagnostics';
import { DjangoProvider } from '../providers';
import * as fs from 'fs';

jest.mock('vscode-languageserver/node', () => {
  return {
    createConnection: jest.fn(() => ({
      listen: jest.fn(),
      onInitialize: jest.fn(),
      onInitialized: jest.fn(),
      onRequest: jest.fn(),
      sendDiagnostics: jest.fn(),
      onDidChangeConfiguration: jest.fn(),
      onCodeAction: jest.fn(),
      onExecuteCommand: jest.fn(),
      onNotification: jest.fn(),
      console: {
        log: jest.fn(),
        error: jest.fn(),
      },
      workspace: {
        getWorkspaceFolders: jest.fn().mockResolvedValue([]),
      },
      languages: {
        diagnostics: {
          on: jest.fn(),
        },
      },
    })),
    ProposedFeatures: {
      all: {}
    },
    TextDocuments: jest.fn().mockImplementation(() => ({
      listen: jest.fn(),
      get: jest.fn(),
      onDidChangeContent: jest.fn(),
      onDidClose: jest.fn(),
      all: jest.fn(),
    }))
  };
});

jest.mock('fs', () => ({
  promises: {
    stat: jest.fn().mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
      atime: new Date(),
      mtime: new Date(),
      ctime: new Date(),
      birthtime: new Date(),
    } as fs.Stats),
    readdir: jest.fn().mockResolvedValue([
      {
        name: 'manage.py',
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
      },
      {
        name: 'models.py',
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
      }
    ] as unknown as fs.Dirent[]),
    readFile: jest.fn().mockResolvedValue('from django.db import models'),
  }
}));


describe('validateTextDocument', () => {
  let textDocument: TextDocument;

  beforeEach(() => {
    textDocument = TextDocument.create(
      'file://test.py',
      'python',
      1,
      'def test_function():\n    pass\n'
    );

    jest.spyOn(DjangoProvider.prototype, 'provideDiagnostics').mockResolvedValue([
      {
        message: 'Test diagnostic',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 1, character: 1 }
        },
        severity: 1,
        source: 'test',
      }
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it.skip('should return diagnostics for a valid document', async () => {
    const diagnosticsQueue = new DiagnosticQueue();
    jest.spyOn(diagnosticsQueue, 'queueDiagnosticRequest').mockImplementation(async (document, callback) => {
      return callback(document);  // Directly call the callback to get the diagnostics
    });

    const diagnostics = await validateTextDocument(textDocument);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toBe('Test diagnostic');
  });
});
