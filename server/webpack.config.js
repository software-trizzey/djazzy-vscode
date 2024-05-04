//@ts-check

"use strict";

const path = require("path");
const nodeExternals = require("webpack-node-externals");
const CopyPlugin = require("copy-webpack-plugin");

/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
	target: "node",
	mode: "none",
	entry: "./src/server.ts",
	output: {
		path: path.resolve(__dirname, "out"),
		filename: "server.js",
		libraryTarget: "commonjs2",
	},
	externals: [nodeExternals()], // Exclude 'node_modules' from the bundle
	resolve: {
		extensions: [".ts", ".js"],
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [
					{
						loader: "babel-loader",
						options: {
							presets: [
								"@babel/preset-env", // Transpile to current Node.js version
								"@babel/preset-typescript", // Handle TypeScript
							],
							plugins: [
								"@babel/plugin-proposal-class-properties",
								"@babel/plugin-transform-runtime", // Optimizes handling of helper code
							],
						},
					},
					"ts-loader", // Continues to handle TypeScript-specific features
				],
			},
		],
	},
	devtool: "nosources-source-map", // Includes source maps without source content
	infrastructureLogging: {
		level: "log",
	},
	plugins: [
		new CopyPlugin({
			patterns: [
				{
					from: path.resolve(__dirname, "./bundled/tools/python"),
					to: path.resolve(__dirname, "out/bundled/tools/python"),
				},
			],
		}),
	],
};

module.exports = [extensionConfig];
