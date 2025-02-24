import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

import { workspaceRoot } from '../settings';
import { getRustBinaryPath } from './getRustBinaryPath';

const CACHE_FILE_NAME = ".djazzy_cache.json";

interface UrlCacheData {
    urls: {
        [filePath: string]: {
            patterns?: string[];
        };
    };
}

export function initializeCache(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const rustBinary = getRustBinaryPath();
        console.log(`Rust binary path: ${rustBinary}`);
        const cacheFile = path.join(workspaceRoot, CACHE_FILE_NAME);

        console.log("🔄 Checking Djazzy cache...");

        if (!fs.existsSync(cacheFile)) {
            console.log("📂 No cache found, running full scan...");
        } else {
            console.log("⚡ Using incremental cache update...");
        }

        const process = cp.spawn(rustBinary, [workspaceRoot]);

        process.stdout.on("data", (data: Buffer) => {
            console.log(`[Djazzy Rust] ${data.toString()}`);
        });

        process.stderr.on("data", (data: Buffer) => {
            console.error(`[Djazzy Rust Error] ${data.toString()}`);
            reject(new Error(`Cache Service Error: ${data.toString()}`));
        });

        process.on("exit", (code: number) => {
            if (code === 0) {
                console.log("✅ Djazzy cache successfully updated.");
                resolve();
            } else {
                reject(new Error(`Rust cache service exited with code ${code}`));
            }
        });
    });
}

/**
* Reads the Djazzy cache from `.djazzy_cache.json`
* @param projectRoot The root directory of the Django project
* @returns A list of all available URL names
*/
export function getCachedUrls(workspaceRoot: string): { url_name: string; file_path: string }[] {
    try {
        const cachePath = path.join(workspaceRoot, ".djazzy_cache.json");
        if (!fs.existsSync(cachePath)) {
            console.warn("No Djazzy cache found.");
            return [];
        }

        const cacheData = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as UrlCacheData;
        if (!cacheData.urls) {
            console.warn("Cache is missing URL data.");
            return [];
        }

        const urlsWithPaths: { url_name: string; file_path: string }[] = [];

        for (const [filePath, data] of Object.entries(cacheData.urls)) {
            if (data.patterns) {
                const relativeFilePath = path.relative(workspaceRoot, filePath); // Convert to relative path
                for (const url of data.patterns) {
                    urlsWithPaths.push({ url_name: url, file_path: relativeFilePath });
                }
            }
        }

        return urlsWithPaths;
    } catch (error) {
        console.error("Error reading Djazzy cache:", error);
        return [];
    }
}