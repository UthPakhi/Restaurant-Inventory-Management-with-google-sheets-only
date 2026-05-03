/**
 * Service to interact with Google Sheets via the backend proxy.
 */

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
  public currentUserEmail: string = 'Unknown';

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
          { range: "Masters_Items!A1:J1", values: [["ID", "Name", "Dept_IDs", "Unit", "BuyPrice", "SellPrice", "Category", "OpeningStock", "MinParLevel", "ReorderQty"]] },
          { range: "Masters_Depts!A1:B1", values: [["ID", "Name"]] },
          { range: "Masters_Suppliers!A1:C1", values: [["ID", "Name", "Contact"]] },
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
    });
    
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Read failed (${res.status}): ${text.substring(0, 100)}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.values || [];
  }

  // ====== Data Abstraction Methods ======

  async getAllItems(): Promise<any[][]> {
      return await this.read('Masters_Items!A2:J');
  }

  async getAllDepartments(): Promise<any[][]> {
      return await this.read('Masters_Depts!A2:B');
  }

  async getAllSuppliers(): Promise<any[][]> {
      return await this.read('Masters_Suppliers!A2:C');
  }

  async getAllBatches(): Promise<any[][]> {
      return await this.read('Batches!A2:H');
  }

  async getAllIssues(): Promise<any[][]> {
      return await this.read('Issues!A2:G');
  }

  async getAllPurchases(): Promise<any[][]> {
      return await this.read('Purchases!A2:I');
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

  async issueFIFO(itemId: string, qtyRequested: number, date: string, deptId: string, itemName?: string, deptName?: string): Promise<any> {
    // Robust number parsing
    const parseNum = (val: any) => {
        if (val === undefined || val === null) return 0;
        const str = String(val).replace(/,/g, '').trim();
        const n = Number(str);
        return isNaN(n) ? 0 : n;
    };

    // 1. Fetch batches for this item
    const allBatches = await this.read('Batches!A2:G');
    const itemBatches = allBatches
        .map((row, index) => ({ 
            id: row[0],
            itemId: row[1] ? String(row[1]).trim() : '',
            date: row[2],
            originalQty: parseNum(row[3]),
            remainingQty: parseNum(row[4]),
            cost: parseNum(row[5]),
            source: row[6],
            rowIndex: index + 2 // A2 is row 2
        }))
        .filter(b => b.itemId === itemId && b.remainingQty > 0)
        .sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateA - dateB;
        });

    const totalAvailable = itemBatches.reduce((sum, b) => sum + b.remainingQty, 0);
    if (totalAvailable < qtyRequested) {
        const displayItem = itemName || itemId;
        throw new Error(`Insufficient stock for item ${displayItem}. Available: ${totalAvailable.toFixed(2)}, Requested: ${qtyRequested}`);
    }

    let remainingToIssue = qtyRequested;
    let totalCost = 0;
    const batchUpdates: { range: string, values: any[][] }[] = [];

    for (const batch of itemBatches) {
        if (remainingToIssue <= 0) break;

        const consumedFromThisBatch = Math.min(batch.remainingQty, remainingToIssue);
        const newRemaining = batch.remainingQty - consumedFromThisBatch;
        
        totalCost += consumedFromThisBatch * batch.cost;
        remainingToIssue -= consumedFromThisBatch;

        // Prepare update for this batch
        batchUpdates.push({
            range: `Batches!E${batch.rowIndex}:E${batch.rowIndex}`,
            values: [[newRemaining]]
        });
    }

    const avgRate = totalCost / qtyRequested;

    // 2. Perform updates to batches
    for (const update of batchUpdates) {
        await this.update(update.range, update.values);
    }

    // 3. Record the issue
    const issueId = `ISS_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    await this.append('Issues!A:G', [[issueId, date, deptId, itemId, qtyRequested, avgRate, this.currentUserEmail]]);
    const displayItem = itemName || itemId;
    const displayDept = deptName || deptId;
    await this.logAudit(this.currentUserEmail, 'ISSUE_STOCK', 'Issues', `Issued ${qtyRequested} of item ${displayItem} to dept ${displayDept}`);

    return { issueId, avgRate, totalCost };
  }

  async reverseIssue(issue: any): Promise<any> {
    const { id, itemId, qty, rate, deptId, date } = issue;
    if (qty <= 0) throw new Error("Cannot reverse a reversal or zero quantity.");

    const ts = Date.now();
    const batchId = `B_REV_${ts}`;
    const revIssueId = `REV_${ts}`;

    // 1. Create a new batch to restore the stock at the same rate
    const newBatch = [batchId, itemId, date, qty, qty, rate, 'Reversal'];

    // 2. Append a negative issue to cancel out the consumption
    const negativeIssue = [revIssueId, date, deptId, itemId, -qty, rate, this.currentUserEmail];

    await this.append('Batches!A:G', [newBatch]);
    await this.append('Issues!A:G', [negativeIssue]);

    await this.logAudit(this.currentUserEmail, 'REVERSE_ISSUE', 'Issues', `Reversed issue ${id} for item ${itemId}, restored ${qty} to stock at rate ${rate}.`);
    
    return { success: true };
  }
}

export const sheetsService = new SheetsService();
