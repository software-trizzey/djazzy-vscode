import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

import { workspaceRoot } from '../settings';
import { getRustBinaryPath } from './getRustBinaryPath';

const CACHE_FILE_NAME = ".djazzy_cache.json";

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
export function getCachedUrls(projectRoot: string): string[] {
    console.log("Getting cached urls for", projectRoot);
   const cacheFile = path.join(projectRoot, CACHE_FILE_NAME);

   if (!fs.existsSync(cacheFile)) {
       console.warn("⚠️ Djazzy URL cache not found. Autocomplete will be empty.");
       return [];
   }

   try {
       const cacheData = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
       const urlEntries = cacheData.urls || {}; // Ensure we read the 'urls' section

       // Flatten all URL names into a single list
       return Object.values(urlEntries).flatMap((entry: any) => entry.patterns || []);
   } catch (error) {
       console.error("❌ Error reading Djazzy cache:", error);
       return [];
   }
}