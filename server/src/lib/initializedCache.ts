import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

import { workspaceRoot } from '../settings';
import { getRustBinaryPath } from './getRustBinaryPath';

export function initializeCache(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const rustBinary = getRustBinaryPath();
        console.log(`Rust binary path: ${rustBinary}`);
        const cacheFile = path.join(workspaceRoot, ".djazzy_cache.json");

        console.log("🔄 Checking Djazzy URL cache...");

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