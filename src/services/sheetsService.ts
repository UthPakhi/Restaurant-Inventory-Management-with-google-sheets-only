/**
 * Service to interact with Google Sheets via the backend proxy.
 */
import { calculateFIFO, Batch } from '../lib/fifoEngine';

export interface GoogleTokens {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

export class SheetsService {
  private tokens: GoogleTokens | null = null;
  private spreadsheetId: string | null = null;
  public isDemoMode: boolean = false;
  private demoData: Record<string, any[][]> = {};
  public currentUserEmail: string = '';

  constructor(tokens?: GoogleTokens, spreadsheetId?: string) {
    if (tokens) this.tokens = tokens;
    if (spreadsheetId) this.spreadsheetId = spreadsheetId;
  }

  isConfigured(): boolean {
    return !!this.tokens && !!this.spreadsheetId;
  }

  setCurrentUser(email: string) {
    this.currentUserEmail = email;
  }

  setDemoMode(isDemo: boolean) {
    this.isDemoMode = isDemo;
    if (isDemo) {
      this.loadDemoData();
    }
  }

  private loadDemoData() {
    const saved = localStorage.getItem('resto_manage_demo_data');
    if (saved) {
      this.demoData = JSON.parse(saved);
    } else {
      // Initialize with headers
      this.demoData = {
        "Masters_Items": [["ID", "Name", "Dept_IDs", "Unit", "BuyPrice", "SellPrice", "Category", "OpeningStock", "MinParLevel", "ReorderQty"]],
        "Masters_Depts": [["ID", "Name"]],
        "Masters_Suppliers": [["ID", "Name", "Contact"]],
        "Purchases": [["ID", "Date", "Item_ID", "Qty", "Rate", "Total", "Supplier_ID", "Invoice_No", "UserEmail"]],
        "Issues": [["ID", "Date", "Dept_ID", "Item_ID", "Qty", "Rate", "UserEmail"]],
        "Batches": [["Batch_ID", "Item_ID", "Date", "Qty_Original", "Qty_Remaining", "Unit_Cost", "Source"]],
        "DailyConsumption": [["Date", "Day", "Handi", "Bar", "Karahi", "Drinks", "Pantree", "Pizza", "Tandoor", "BBQ", "Tea", "TOTAL"]],
        "Sales": [["ID", "Date", "Amount", "Dept_ID"]],
        "Cashflow": [["ID", "Date", "Type", "Amount", "Description", "Ref_ID"]],
        "Recipes": [["Menu_Item_Name", "Raw_Item_ID", "Qty_Per_Portion"]],
        "MenuSales": [["Date", "Menu_Item_Name", "Qty_Sold", "Amount"]],
        "AuditLogs": [["Timestamp", "UserEmail", "Action", "Sheet", "Details"]],
        "AppSettings": [["Key", "Value"], ["RestaurantName", "RestoManage"], ["LogoUrl", ""]]
      };
      this.saveDemoData();
    }
  }

  private saveDemoData() {
    localStorage.setItem('resto_manage_demo_data', JSON.stringify(this.demoData));
  }

  setTokens(tokens: GoogleTokens) {
    this.isDemoMode = false;
    this.tokens = tokens;
  }

  setSpreadsheetId(id: string) {
    this.spreadsheetId = id;
  }

  async getAuthUrl(): Promise<string> {
    const redirectUri = `${window.location.origin}/api/auth/callback`;
    const res = await fetch(`/api/auth/google/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
    const data = await res.json();
    return data.url;
  }

  async createSpreadsheet(name: string): Promise<any> {
    if (this.isDemoMode) {
      this.spreadsheetId = "demo-sheet-id";
      return { spreadsheetId: this.spreadsheetId };
    }
    const res = await fetch("/api/sheets/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: this.tokens, name }),
    });
    const data = await res.json();
    this.spreadsheetId = data.spreadsheetId;
    return data;
  }

  async initializeSheetStructure(): Promise<any> {
    if (this.isDemoMode) return { success: true };
    if (!this.spreadsheetId) throw new Error("No spreadsheet ID set");

    const titles = [
      "Masters_Items", "Masters_Depts", "Masters_Suppliers", 
      "Purchases", "Issues", "Batches", "DailyConsumption", 
      "Sales", "Cashflow", "MonthlySummary", "Recipes", "MenuSales",
      "AuditLogs", "AppSettings"
    ];

    for (const title of titles) {
      try {
        const res = await fetch("/api/sheets/batchUpdate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            tokens: this.tokens, 
            spreadsheetId: this.spreadsheetId, 
            requests: [{ addSheet: { properties: { title } } }]
          }),
        });
        const data = await res.json();
        if (data.error && !data.error.includes("already exists")) {
            console.warn(`Failed to create sheet ${title}:`, data.error);
        }
      } catch (e) {
        // Network error or other
        console.error(`Network error creating sheet ${title}:`, e);
      }
    }

    // Also add headers to each sheet
    await this.setupHeaders();

    return { success: true };
  }

  private async setupHeaders() {
      const headers = [
          { range: "Masters_Items!A1:K1", values: [["ID", "Name", "Dept_IDs", "Unit", "BuyPrice", "SellPrice", "Category", "OpeningStock", "MinParLevel", "ReorderQty", "Status"]] },
          { range: "Masters_Depts!A1:C1", values: [["ID", "Name", "Status"]] },
          { range: "Masters_Suppliers!A1:D1", values: [["ID", "Name", "Contact", "Status"]] },
          { range: "Purchases!A1:I1", values: [["ID", "Date", "Item_ID", "Qty", "Rate", "Total", "Supplier_ID", "Invoice_No", "UserEmail"]] },
          { range: "Issues!A1:G1", values: [["ID", "Date", "Dept_ID", "Item_ID", "Qty", "Rate", "UserEmail"]] },
          { range: "Batches!A1:G1", values: [["Batch_ID", "Item_ID", "Date", "Qty_Original", "Qty_Remaining", "Unit_Cost", "Source"]] },
          { range: "DailyConsumption!A1:L1", values: [["Date", "Day", "Handi", "Bar", "Karahi", "Drinks", "Pantree", "Pizza", "Tandoor", "BBQ", "Tea", "TOTAL"]] },
          { range: "Sales!A1:D1", values: [["ID", "Date", "Amount", "Dept_ID"]] },
          { range: "Cashflow!A1:F1", values: [["ID", "Date", "Type", "Amount", "Description", "Ref_ID"]] },
          { range: "Recipes!A1:C1", values: [["Menu_Item_Name", "Raw_Item_ID", "Qty_Per_Portion"]] },
          { range: "MenuSales!A1:D1", values: [["Date", "Menu_Item_Name", "Qty_Sold", "Amount"]] },
          { range: "AuditLogs!A1:E1", values: [["Timestamp", "UserEmail", "Action", "Sheet", "Details"]] },
          { range: "AppSettings!A1:B3", values: [["Key", "Value"], ["RestaurantName", "RestoManage"], ["LogoUrl", ""]] },
      ];

      for (const h of headers) {
          try {
              // Read first row to see if headers exist
              const existing = await this.read(h.range);
              if (existing && existing.length > 0 && existing[0][0] === h.values[0][0]) {
                  // Headers likely exist, skip
                  continue;
              }
              
              await this.update(h.range, h.values);
          } catch (e) {
              console.error(`Failed to setup headers for ${h.range}`, e);
          }
      }
  }

  async read(range: string): Promise<any[][]> {
      if (this.isDemoMode) {
          const [sheetName, cellRange] = range.split('!');
          const data = this.demoData[sheetName] || [];
          if (!cellRange) return data;
          
          // Basic cell range support (e.g. A2:G)
          const match = cellRange.match(/([A-Z])(\d+):([A-Z])?(\d+)?/);
          if (match) {
              const startRow = parseInt(match[2]) - 1;
              return data.slice(startRow);
          }
          return data;
      }

    const res = await fetch("/api/sheets/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            tokens: this.tokens,
            spreadsheetId: this.spreadsheetId,
            range
        })
    }).catch(err => {
        // Network error
        throw new Error(`NETWORK_ERROR`);
    });
    
    if (!res.ok) {
        const text = await res.text();
        // If range is invalid because it's empty, out of bounds, or deleted, assume empty.
        if (res.status === 400) {
            return [];
        }
        throw new Error(`API_ERROR: Read failed (${res.status}): ${text.substring(0, 100)}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(`API_ERROR: ${data.error}`);
    return data.values || [];
  }

  // ====== Data Abstraction Methods ======

  private async getWithFallback(range: string, localTableName: 'masters_items' | 'masters_depts' | 'masters_suppliers' | 'batches' | 'issues' | 'purchases'): Promise<any[][]> {
      try {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
              const localDb = (await import('./localDb')).localDb;
              const cached = await localDb.getTable(localTableName);
              if (cached) return cached;
          }
          const data = await this.read(range);
          import('./localDb').then(m => m.localDb.setTable(localTableName, data)).catch(console.error);
          return data;
      } catch (err: any) {
          if (err.message === 'NETWORK_ERROR') {
              const localDb = (await import('./localDb')).localDb;
              const cached = await localDb.getTable(localTableName);
              if (cached) return cached;
          } else if (err.message && err.message.includes('API_ERROR') && err.message.includes('400')) {
             // If bad request (like range not found because it's empty), just assume empty
             import('./localDb').then(m => m.localDb.setTable(localTableName, [])).catch(console.error);
             return [];
          }
          throw err;
      }
  }

  async getAllItems(): Promise<any[][]> {
      return this.getWithFallback('Masters_Items!A2:K', 'masters_items');
  }

  async getAllDepartments(): Promise<any[][]> {
      return this.getWithFallback('Masters_Depts!A2:C', 'masters_depts');
  }

  async getAllSuppliers(): Promise<any[][]> {
      return this.getWithFallback('Masters_Suppliers!A2:D', 'masters_suppliers');
  }

  async getAllBatches(): Promise<any[][]> {
      return this.getWithFallback('Batches!A2:H', 'batches');
  }

  async getAllIssues(): Promise<any[][]> {
      return this.getWithFallback('Issues!A2:G', 'issues');
  }

  async getAllPurchases(): Promise<any[][]> {
      return this.getWithFallback('Purchases!A2:I', 'purchases');
  }

  async logAudit(userEmail: string, action: string, sheetName: string, details: string) {
    const timestamp = new Date().toISOString();
    // Do not log audit logic about AuditLogs to avoid infinite loops, though should be fine
    await this.append("AuditLogs!A:E", [[timestamp, userEmail || "Unknown", action, sheetName, details]]);
  }

  async append(range: string, values: any[][]): Promise<any> {
    if (this.isDemoMode) {
        const [sheetName] = range.split('!');
        if (!this.demoData[sheetName]) this.demoData[sheetName] = [];
        this.demoData[sheetName].push(...values);
        this.saveDemoData();
        return { success: true };
    }
    const res = await fetch("/api/sheets/append", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokens: this.tokens,
        spreadsheetId: this.spreadsheetId,
        range,
        values
      })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Append failed (${res.status}): ${text.substring(0, 100)}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async update(range: string, values: any[][]): Promise<any> {
    if (this.isDemoMode) {
        const [sheetName, cellRange] = range.split('!');
        if (!this.demoData[sheetName]) this.demoData[sheetName] = [];
        
        // Basic cell range support (e.g. Batches!E2:E2)
        const match = cellRange.match(/([A-Z])(\d+):([A-Z])?(\d+)?/);
        if (match) {
            const startColIdx = match[1].charCodeAt(0) - 65;
            const startRowIdx = parseInt(match[2]) - 1;
            
            values.forEach((row, rIdx) => {
                const targetRow = startRowIdx + rIdx;
                if (!this.demoData[sheetName][targetRow]) {
                    this.demoData[sheetName][targetRow] = [];
                }
                row.forEach((cell, cIdx) => {
                    this.demoData[sheetName][targetRow][startColIdx + cIdx] = cell;
                });
            });
        } else {
            this.demoData[sheetName] = values;
        }
        
        this.saveDemoData();
        return { success: true };
    }

    const res = await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokens: this.tokens,
        spreadsheetId: this.spreadsheetId,
        range,
        values
      })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Update failed (${res.status}): ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async valuesBatchUpdate(data: { range: string, values: any[][] }[]): Promise<any> {
    if (this.isDemoMode) {
        for (const entry of data) {
            await this.update(entry.range, entry.values);
        }
        return { success: true };
    }
    const res = await fetch("/api/sheets/valuesBatchUpdate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokens: this.tokens,
        spreadsheetId: this.spreadsheetId,
        data
      })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Batch update failed (${res.status}): ${text.substring(0, 100)}`);
    }

    return await res.json();
  }

  async batchClear(ranges: string[]): Promise<any> {
    if (this.isDemoMode) {
        this.loadDemoData(); // resetting to initial state
        return { success: true };
    }
    const res = await fetch("/api/sheets/batchClear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokens: this.tokens,
        spreadsheetId: this.spreadsheetId,
        ranges
      })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Batch clear failed (${res.status}): ${text.substring(0, 100)}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async performFactoryReset(): Promise<void> {
    const allSheetsToClear = [
        "Masters_Items!A2:Z",
        "Masters_Depts!A2:Z",
        "Masters_Suppliers!A2:Z",
        "Purchases!A2:Z",
        "Issues!A2:Z",
        "Batches!A2:Z",
        "DailyConsumption!A2:Z",
        "Sales!A2:Z",
        "Cashflow!A2:Z",
        "Recipes!A2:Z",
        "MenuSales!A2:Z",
        "AuditLogs!A2:Z"
    ];
    await this.batchClear(allSheetsToClear);
    
    // Clear localDB cache
    const localDb = (await import('./localDb')).localDb;
    await localDb.clearAll();
  }

  async bulkIssueFIFO(issues: { itemId: string, qty: number, date: string, deptId: string, itemName?: string, deptName?: string }[]): Promise<any> {
    const parseNum = (val: any) => {
        if (val === undefined || val === null) return 0;
        const str = String(val).replace(/,/g, '').trim();
        const n = Number(str);
        return isNaN(n) ? 0 : n;
    };

    // 1. Fetch ALL batches
    const allBatchesRaw = await this.read('Batches!A2:G');
    const allBatches = allBatchesRaw.map((row, index) => ({
        id: String(row[0] || ''),
        itemId: row[1] ? String(row[1]).trim() : '',
        date: row[2],
        originalQty: parseNum(row[3]),
        remainingQty: parseNum(row[4]),
        cost: parseNum(row[5]),
        source: row[6],
        rowIndex: index + 2
    }));

    const results = [];
    const issueRows: any[][] = [];
    const auditRows: any[][] = [];
    const batchUpdates: { range: string, values: any[][] }[] = [];

    // Track state of batches in memory as we process each issue
    const localBatches: (Batch & { rowIndex: number })[] = allBatches.map(b => ({...b}));

    for (const issueReq of issues) {
        const result = calculateFIFO(issueReq, localBatches);

        if (!result.success) {
            results.push({ success: false, error: result.error, itemId: issueReq.itemId });
            continue;
        }

        // Apply changes to localBatches for the next issue in the same bulk request
        if (result.consumedBatches) {
            result.consumedBatches.forEach(cb => {
                const batch = localBatches.find(b => b.rowIndex === cb.rowIndex);
                if (batch) batch.remainingQty = cb.newRemaining;
            });
        }

        const issueId = result.issueId!;
        const avgRate = result.avgRate!;
        const totalCost = result.totalCost!;
        
        issueRows.push([issueId, issueReq.date, issueReq.deptId, issueReq.itemId, issueReq.qty, avgRate, this.currentUserEmail]);
        auditRows.push([new Date().toISOString(), this.currentUserEmail, 'ISSUE_STOCK', 'Issues', `Issued ${issueReq.qty} of item ${issueReq.itemName || issueReq.itemId} to dept ${issueReq.deptName || issueReq.deptId}`]);
        
        results.push({ ...result, success: true });
    }

    // 2. Consolidate batch updates - find batches that were actually modified
    for (const batch of localBatches) {
        const original = allBatches.find(b => b.rowIndex === batch.rowIndex);
        if (original && original.remainingQty !== batch.remainingQty) {
            batchUpdates.push({
                range: `Batches!E${batch.rowIndex}:E${batch.rowIndex}`,
                values: [[batch.remainingQty]]
            });
        }
    }

    // 3. Execution (Batched)
    const promises: Promise<any>[] = [];
    if (batchUpdates.length > 0) {
        promises.push(this.valuesBatchUpdate(batchUpdates));
    }
    if (issueRows.length > 0) {
        promises.push(this.append('Issues!A:G', issueRows));
    }
    if (auditRows.length > 0) {
        promises.push(this.append('AuditLogs!A:E', auditRows));
    }

    await Promise.all(promises);

    return results;
  }

  async issueFIFO(itemId: string, qtyRequested: number, date: string, deptId: string, itemName?: string, deptName?: string): Promise<any> {
    // Robust number parsing
    const parseNum = (val: any) => {
        if (val === undefined || val === null) return 0;
        const str = String(val).replace(/,/g, '').trim();
        const n = Number(str);
        return isNaN(n) ? 0 : n;
    };

    // 1. Fetch batches for this item
    const allBatchesRaw = await this.read('Batches!A2:G');
    const allBatches: (Batch & { rowIndex: number })[] = allBatchesRaw
        .map((row, index) => ({ 
            id: String(row[0] || ''),
            itemId: row[1] ? String(row[1]).trim() : '',
            date: row[2],
            originalQty: parseNum(row[3]),
            remainingQty: parseNum(row[4]),
            cost: parseNum(row[5]),
            source: row[6],
            rowIndex: index + 2 
        }));

    const result = calculateFIFO({ itemId, qty: qtyRequested, date, deptId, itemName, deptName }, allBatches);

    if (!result.success) {
        throw new Error(result.error);
    }

    const { avgRate, totalCost, consumedBatches, issueId } = result;

    // 2. Perform updates to batches
    for (const cb of consumedBatches) {
        await this.update(`Batches!E${cb.rowIndex}:E${cb.rowIndex}`, [[cb.newRemaining]]);
    }

    // 3. Record the issue
    const id = issueId!;
    await this.append('Issues!A:G', [[id, date, deptId, itemId, qtyRequested, avgRate, this.currentUserEmail]]);
    const displayItem = itemName || itemId;
    const displayDept = deptName || deptId;
    await this.logAudit(this.currentUserEmail, 'ISSUE_STOCK', 'Issues', `Issued ${qtyRequested} of item ${displayItem} to dept ${displayDept}`);

    return { issueId: id, avgRate, totalCost };
  }

  async reverseIssue(issue: any): Promise<any> {
    console.log('Attempting to reverse issue:', issue);
    const { id, itemId, qty, rate, deptId, date } = issue;
    if (qty <= 0) throw new Error("Cannot reverse a reversal or zero quantity.");

    const ts = Date.now();
    const batchId = `B_REV_${ts}`;
    const revIssueId = `REV_${id}`;
    const email = this.currentUserEmail || 'Unknown';

    // 1. Create a new batch to restore the stock at the same rate
    const newBatch = [batchId, itemId, date, qty, qty, rate, `Reversal of ${id}`];

    // 2. Append a negative issue to cancel out the consumption
    const negativeIssue = [revIssueId, date, deptId, itemId, -qty, rate, email];

    await Promise.all([
        this.append('Batches!A:G', [newBatch]),
        this.append('Issues!A:G', [negativeIssue])
    ]);

    await this.logAudit(email, 'REVERSE_ISSUE', 'Issues', `Reversed issue ${id} for item ${itemId}, restored ${qty} to stock at rate ${rate}.`);
    
    return { success: true };
  }
}

export const sheetsService = new SheetsService();
