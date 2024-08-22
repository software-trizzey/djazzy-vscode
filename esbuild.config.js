const process = require('process');
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

console.log(`[ES_BUILD] Creating production build: ${production}`);
console.log(`[ES_BUILD] Running in watch mode: ${watch}`);

async function main() {
	const clientContext = await esbuild.context({
		entryPoints: ['client/src/extension.ts'],
		bundle: true,
		minify: production,
		sourcemap: !production,
		platform: 'node',
		external: [
			'vscode',
			"@octokit/rest",
			"vscode-languageclient",
			'rollbar',
			"simple-git", 
			'uuid'
		],
		logLevel: !production ? 'debug' : 'silent',
		outdir: 'client/out',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin
		]
	});

	const serverContext = await esbuild.context({
		entryPoints: ['server/src/server.ts'],
		bundle: true,
		minify: production,
		sourcemap: !production,
		platform: 'node',
		external: [
		  'vscode', 
		  'lru-cache', 
		  'rollbar', 
		  'uuid', 
		  'vscode-languageserver', 
		  'vscode-languageserver-textdocument', 
		  'vscode-uri'
		],
		logLevel: !production ? 'debug' : 'silent',
		outdir: 'server/out',
		plugins: [
		  /* add to the end of plugins array */
		  esbuildProblemMatcherPlugin
		]
	  })

	if (watch) {
	  await Promise.all([clientContext.watch(), serverContext.watch()]);
	} else {
		await clientContext.rebuild();
		await serverContext.rebuild();
		await Promise.all([clientContext.dispose(), serverContext.dispose()]);
	}
  }


/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',
  
	setup(build) {
	  build.onStart(() => {
		console.log(`[ES_BUILD] Build started for ${build.initialOptions.entryPoints}`);
	  });
	  build.onEnd(result => {
		if (result.errors.length) {
		  result.errors.forEach(({ text, location }) => {
			console.error(`✘ [ERROR] ${text}`);
			console.error(`    ${location.file}:${location.line}:${location.column}: ${location.lineText || ''}`);
		  });
		} else {
		  console.log(`[ES_BUILD] Build finished successfully for ${build.initialOptions.entryPoints}`);
		}
	  });
	}
  };
  
  main().catch(error => {
	console.error('Build failed with error:', error);
	process.exit(1);
  });
