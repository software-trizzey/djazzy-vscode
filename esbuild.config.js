const process = require('process');
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['client/src/extension.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  platform: 'node',
  external: ['vscode'],
  outdir: 'client/out',
}).catch(() => process.exit(1));

esbuild.build({
  entryPoints: ['server/src/server.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  platform: 'node',
  external: ['vscode'],
  outdir: 'server/out',
}).catch(() => process.exit(1));
