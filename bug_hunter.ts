import { sheetsService } from './src/services/sheetsService.js';
import { calculateFIFO } from './src/lib/fifoEngine.js';
import 'fake-indexeddb/auto';

// Setup Mock Environment
global.window = { location: { origin: 'http://localhost' } } as any;
Object.defineProperty(global, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
let mStore: any = {};
global.localStorage = {
  getItem: (k: string) => mStore[k] || null,
  setItem: (k: string, v: string) => mStore[k] = v,
  clear: () => mStore = {}
} as any;

const assert = (condition: boolean, msg: string) => {
    if (!condition) throw new Error(msg);
}

sheetsService.setDemoMode(true);

async function runTest(name: string, p: () => Promise<void>) {
    console.log(`\n[TEST START] ${name}`);
    try {
        await p();
        console.log(`[PASS] ${name}`);
    } catch(e: any) {
        console.log(`[FAIL] ${name}`);
        console.log(`Issue: ${e.message}`);
    }
}

async function runAll() {
    console.log("--- BUG HUNTING SESSION START ---");

    // Test 1: Parallel FIFO Issue (Race Condition Simulation)
    await runTest("Parallel FIFO Issue (Race Condition)", async () => {
        // Setup 10 units
        await sheetsService.batchClear([]);
        await sheetsService.append("Masters_Items!A:K", [["ITEM_RACE", "Race Item", "D1", "KG", 10, 15, "Fruit", 0, 5, 10, "Active"]]);
        await sheetsService.append("Batches!A:G", [["B_RACE", "ITEM_RACE", "2026-05-01", 10, 10, 10, "Purchase"]]);
        
        const initialBatches = await sheetsService.read("Batches"); 
        
        try {
            const results = await Promise.allSettled([
                sheetsService.issueFIFO("ITEM_RACE", 6, "2026-05-06", "D1"),
                sheetsService.issueFIFO("ITEM_RACE", 6, "2026-05-06", "D1")
            ]);

            const finalBatches = await sheetsService.read("Batches");
            const batch = finalBatches.find(b => b[1] === "ITEM_RACE");
            console.log(`Actual final batch qty: ${batch[4]}`);
            
            const issues = await sheetsService.read("Issues");
            const raceIssues = issues.filter(i => i[3] === "ITEM_RACE");
            console.log(`Total issues recorded: ${raceIssues.length}`);
            
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            console.log(`Successful operations: ${successCount}`);

            assert(successCount === 1, `BUG: Multiple operations succeeded despite insufficient stock! (${successCount}/2)`);
        } catch (e: any) {
            if (e.message.includes("BUG:")) throw e;
            console.log(`System caught conflict: ${e.message}`);
        }
    });

    // Test 6: Double Reversal Bug (Ghost Stock)
    await runTest("Double Reversal Bug (Ghost Stock)", async () => {
        await sheetsService.batchClear([]);
        await sheetsService.append("Masters_Items!A:K", [["ITEM_REV", "Rev Item", "D1", "KG", 10, 15, "Fruit", 0, 5, 10, "Active"]]);
        await sheetsService.append("Batches!A:G", [["B_REV", "ITEM_REV", "2026-05-01", 10, 10, 10, "P"]]);
        
        const issue = await sheetsService.issueFIFO("ITEM_REV", 5, "2026-05-06", "D1");
        const issueObj = { id: issue.issueId, itemId: "ITEM_REV", qty: 5, rate: 10, deptId: "D1", date: "2026-05-06" };
        
        try {
            await sheetsService.reverseIssue(issueObj);
            
            const midBatches = await sheetsService.read("Batches");
            let midTotal = 0;
            midBatches.filter(r => r[1] === "ITEM_REV").forEach(b => {
                 const qty = parseFloat(b[4]);
                 if (!isNaN(qty)) midTotal += qty;
            });
            console.log(`Total stock after first reversal: ${midTotal} (Expected 10)`);
            assert(midTotal === 10, "Reversal failed to restore stock correctly");

            // This second call should throw an error
            await sheetsService.reverseIssue(issueObj); 
            
            throw new Error("BUG: Duplicate reversal was not blocked!");
        } catch (e: any) {
            if (e.message.includes("BUG:")) throw e;
            console.log(`Expected behavior achieved: Caught duplicate reversal: ${e.message}`);
        }
    });

    // Test 2: Date Format Chaos (FIFO Sorting)
    await runTest("Date Format Chaos (FIFO Sorting)", async () => {
        await sheetsService.batchClear([]);
        await sheetsService.append("Masters_Items!A:K", [["ITEM_DATE", "Date Item", "D1", "KG", 10, 15, "Fruit", 0, 5, 10, "Active"]]);
        
        // Batch A: May 10, Rate 10
        await sheetsService.append("Batches!A:G", [["B_A", "ITEM_DATE", "2026-05-10", 10, 10, 10, "P_A"]]);
        // Batch B: Jan 01 (Entered later but chronologically earlier), Rate 20
        await sheetsService.append("Batches!A:G", [["B_B", "ITEM_DATE", "2026-01-01", 10, 10, 20, "P_B"]]);
        
        const res = await sheetsService.issueFIFO("ITEM_DATE", 5, "2026-05-11", "D1");
        console.log(`Consumed Rate: ${res.avgRate} (Expected 20)`);
        assert(res.avgRate === 20, `FIFO should have picked Jan batch (20) before May batch (10). Got rate: ${res.avgRate}`);
    });

    // Test 3: Floating Point Precision Stress
    await runTest("Floating Point Precision Stress", async () => {
        await sheetsService.batchClear([]);
        await sheetsService.append("Masters_Items!A:K", [["ITEM_FLOAT", "Float Item", "D1", "L", 10, 15, "Liquid", 0, 5, 10, "Active"]]);
        await sheetsService.append("Batches!A:G", [["B_F", "ITEM_FLOAT", "2026-05-01", 1, 1, 10, "P_F"]]);
        
        await sheetsService.issueFIFO("ITEM_FLOAT", 0.3333, "2026-05-06", "D1");
        await sheetsService.issueFIFO("ITEM_FLOAT", 0.3333, "2026-05-06", "D1");
        await sheetsService.issueFIFO("ITEM_FLOAT", 0.3334, "2026-05-06", "D1");
        
        const batches = await sheetsService.read("Batches");
        const b = batches.find(x => x[0] === "B_F");
        console.log(`Remaining Qty: ${b[4]}`);
        assert(parseFloat(b[4]) === 0, `Floating point drift! Remaining: ${b[4]}`);
    });

    // Test 4: Manual Sheet Corruption (Dirty Data)
    await runTest("Manual Sheet Corruption (Dirty Data)", async () => {
        await sheetsService.batchClear([]);
        await sheetsService.append("Batches!A:G", [["B_DIRTY", "ITEM_DIRTY", "2026-05-01", "InvalidQty", "CorruptQty", "NaN_Rate", "Manual"]]);
        
        try {
            await sheetsService.issueFIFO("ITEM_DIRTY", 5, "2026-05-06", "D1");
            assert(false, "Should have failed due to 0 stock (due to corruption)");
        } catch (e: any) {
            console.log(`Caught error as expected: ${e.message}`);
            assert(e.message.includes("Insufficient stock"), "Should report insufficient stock because corruption became 0");
        }
    });

    // Test 5: Zero Rate FIFO Purchase
    await runTest("Zero Rate FIFO Purchase", async () => {
        await sheetsService.batchClear([]);
        await sheetsService.append("Masters_Items!A:K", [["ITEM_ZERO", "Zero Item", "D1", "KG", 0, 0, "Free", 0, 5, 10, "Active"]]);
        await sheetsService.append("Batches!A:G", [["B_ZERO", "ITEM_ZERO", "2026-05-01", 10, 10, 0, "Freebie"]]);
        
        const res = await sheetsService.issueFIFO("ITEM_ZERO", 5, "2026-05-06", "D1");
        console.log(`Avg Rate: ${res.avgRate}`);
        assert(res.avgRate === 0, `Zero rate should result in 0 cost. Got: ${res.avgRate}`);
    });

    console.log("\n--- BUG HUNTING SESSION END ---");
}

runAll().catch(console.error);
