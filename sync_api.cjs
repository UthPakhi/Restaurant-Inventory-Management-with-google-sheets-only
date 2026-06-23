const fs = require('fs');

const serverStr = fs.readFileSync('server.ts', 'utf8');
const apiStr = fs.readFileSync('api/index.ts', 'utf8');

const serverRoutesStart = serverStr.indexOf('app.get("/api/health"');
const serverRoutesEnd = serverStr.indexOf('// --- End API Routes ---');
const routesContent = serverStr.substring(serverRoutesStart, serverRoutesEnd);

const apiRoutesStart = apiStr.indexOf('app.get("/api/health"');
const apiRoutesEnd = apiStr.indexOf('export default app;');

let newApiContent = apiStr.substring(0, apiRoutesStart);

if (!newApiContent.includes('acquireLock')) {
  newApiContent += `
import { GoogleGenAI, Type } from "@google/genai";

// Helper to serialize atomic operations
const lockMap = new Map<string, Promise<void>>();
const acquireLock = async (id: string): Promise<() => void> => {
    while (lockMap.has(id)) {
        await lockMap.get(id);
    }
    let resolve: () => void = () => {};
    const promise = new Promise<void>((r) => { resolve = r; });
    lockMap.set(id, promise);
    return () => {
        lockMap.delete(id);
        resolve();
    };
};

`;
}

newApiContent += routesContent + '\n\n' + apiStr.substring(apiRoutesEnd);

fs.writeFileSync('api/index.ts', newApiContent);
console.log('Synced api/index.ts');
