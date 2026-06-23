import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple in-memory lock map for spreadsheets to prevent race conditions
const spreadsheetLocks: Record<string, Promise<void>> = {};

async function acquireLock(spreadsheetId: string) {
    if (!spreadsheetId) return () => {};
    
    const currentLock = spreadsheetLocks[spreadsheetId] || Promise.resolve();
    let resolveLock: () => void;
    
    const newLock = new Promise<void>((resolve) => {
        resolveLock = resolve;
    });
    
    spreadsheetLocks[spreadsheetId] = newLock;
    await currentLock;
    
    return () => {
        resolveLock();
    };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set('trust proxy', true);
  app.use(express.json());

  // Google OAuth Config
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/api/auth/callback`
  );

  // --- API Routes ---

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Helper to get base URL
  const getRedirectUri = (req: express.Request) => {
    const referer = req.headers.referer;
    if (referer) {
      try {
        const url = new URL(referer);
        if (url.hostname.endsWith(".run.app") || url.hostname.endsWith("vercel.app") || url.hostname === "inventory.tharcuisine.com") {
          return `${url.origin}/api/auth/callback`;
        }
      } catch (e) {
        // ignore
      }
    }

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers["host"];
    return `${protocol}://${host}/api/auth/callback`;
  };

  // 1. Get Google Auth URL
  app.get("/api/auth/google/url", (req, res) => {
    const scopes = [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ];

    const redirectUri = (req.query.redirect_uri as string) || getRedirectUri(req);
    
    let customState: any = {};
    if (req.query.state) {
      try { customState = JSON.parse(req.query.state as string); } catch(e) {}
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "select_account consent",
      redirect_uri: redirectUri,
      state: JSON.stringify({ r: redirectUri, ...customState }),
    });

    res.json({ url });
  });

  // 2. OAuth Callback
  app.get(["/api/auth/callback", "/api/auth/callback/"], async (req, res) => {
    const { code, state } = req.query;

    try {
      let redirectUri = getRedirectUri(req);
      let authState: any = {};
      if (state) {
        try {
          const parsed = JSON.parse(state as string);
          if (parsed.r) redirectUri = parsed.r;
          authState = parsed;
        } catch (e) {
          // ignore
        }
      }

      const { tokens } = await oauth2Client.getToken({
        code: code as string,
        redirect_uri: redirectUri,
      });
      // In a real app, you'd store these tokens in a database (like Firestore) 
      // linked to the firebase user. For now, we'll send them back or set a cookie.
      // We'll use the postMessage pattern from the skill.
      
      res.send(`
        <html>
          <body>
            <script>
              const authResult = { 
                type: 'GOOGLE_AUTH_SUCCESS', 
                tokens: ${JSON.stringify(tokens)},
                state: ${JSON.stringify(authState)}
              };
              try {
                try { localStorage.setItem('resto_oauth_result', JSON.stringify(authResult)); } catch(e) {}
                
                if (window.opener && !window.opener.closed) {
                  window.opener.postMessage(authResult, '*');
                }
                
                window.close();
                
                setTimeout(() => {
                  if (!window.closed) {
                    window.location.href = '/';
                  }
                }, 1500);
              } catch (e) {
                  try { localStorage.setItem('resto_oauth_result', JSON.stringify(authResult)); } catch(err) {}
                  window.close();
                  setTimeout(() => {
                    window.location.href = '/';
                  }, 1500);
              }
            </script>
            <p>Authentication successful. You will be redirected shortly.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error exchanging code for tokens:", error);
      res.status(500).send("Authentication failed.");
    }
  });

  // 3. Sheets Proxy (Example: Create Sheet)
  app.post("/api/sheets/create", async (req, res) => {
    const { tokens, name } = req.body;
    if (!tokens) return res.status(401).json({ error: "Missing tokens" });

    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });

    try {
      const response = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: name || "Restaurant Inventory System" },
        },
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4. Batch Update Proxy (for initialization)
  app.post("/api/sheets/batchUpdate", async (req, res) => {
    const { tokens, spreadsheetId, requests } = req.body;
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });

    try {
      const response = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sheets/batchClear", async (req, res) => {
      const { tokens, spreadsheetId, ranges } = req.body;
      const release = await acquireLock(spreadsheetId);
      try {
          oauth2Client.setCredentials(tokens);
          const sheets = google.sheets({ version: "v4", auth: oauth2Client });
          const response = await sheets.spreadsheets.values.batchClear({
              spreadsheetId,
              requestBody: { ranges }
          });
          res.json(response.data);
      } catch (error: any) {
          res.status(500).json({ error: error.message });
      } finally {
          release();
      }
  });

  // 5. Appending / Reading data proxies would go here
  app.post("/api/sheets/append", async (req, res) => {
      const { tokens, spreadsheetId, range, values } = req.body;
      const release = await acquireLock(spreadsheetId);
      try {
          oauth2Client.setCredentials(tokens);
          const sheets = google.sheets({ version: "v4", auth: oauth2Client });
          const response = await sheets.spreadsheets.values.append({
              spreadsheetId,
              range,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values }
          });
          res.json(response.data);
      } catch (error: any) {
          res.status(500).json({ error: error.message });
      } finally {
          release();
      }
  });

  app.post("/api/sheets/read", async (req, res) => {
      const { tokens, spreadsheetId, range } = req.body;
      oauth2Client.setCredentials(tokens);
      const sheets = google.sheets({ version: "v4", auth: oauth2Client });
      try {
          const response = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range
          });
          res.json(response.data);
      } catch (error: any) {
          res.status(500).json({ error: error.message });
      }
  });

  app.post("/api/sheets/update", async (req, res) => {
      const { tokens, spreadsheetId, range, values } = req.body;
      const release = await acquireLock(spreadsheetId);
      try {
          oauth2Client.setCredentials(tokens);
          const sheets = google.sheets({ version: "v4", auth: oauth2Client });
          const response = await sheets.spreadsheets.values.update({
              spreadsheetId,
              range,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values }
          });
          res.json(response.data);
      } catch (error: any) {
          res.status(500).json({ error: error.message });
      } finally {
          release();
      }
  });

  app.post("/api/sheets/metadata", async (req, res) => {
      const { tokens, spreadsheetId } = req.body;
      oauth2Client.setCredentials(tokens);
      const sheets = google.sheets({ version: "v4", auth: oauth2Client });
      try {
          const response = await sheets.spreadsheets.get({ spreadsheetId });
          const sheetsData = response.data.sheets?.map(s => ({
              title: s.properties?.title,
              rowCount: s.properties?.gridProperties?.rowCount,
              lastRow: 0 // Placeholder, we'll infer from data if needed
          }));
          res.json(sheetsData);
      } catch (error: any) {
          console.error("[Spreadsheet Metadata Error]", error.message || error);
          res.status(500).json({ error: error.message || error.toString() });
      }
  });

  app.post("/api/sheets/valuesBatchUpdate", async (req, res) => {
      const { tokens, spreadsheetId, data } = req.body;
      const release = await acquireLock(spreadsheetId);
      try {
          oauth2Client.setCredentials(tokens);
          const sheets = google.sheets({ version: "v4", auth: oauth2Client });
          const response = await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId,
              requestBody: {
                  valueInputOption: 'USER_ENTERED',
                  data
              }
          });
          res.json(response.data);
      } catch (error: any) {
          res.status(500).json({ error: error.message });
      } finally {
          release();
      }
  });

  // ATOMIC INVENTORY OPERATIONS
  // Moved to server to prevent race conditions during read-modify-write FIFO cycle
  app.post("/api/inventory/issue", async (req, res) => {
      const { tokens, spreadsheetId, issues, userEmail } = req.body;
      if (!tokens || !spreadsheetId || !issues) {
          return res.status(400).json({ error: "Missing required parameters" });
      }

      const release = await acquireLock(spreadsheetId);
      try {
          oauth2Client.setCredentials(tokens);
          const sheets = google.sheets({ version: "v4", auth: oauth2Client });

          // 1. Fetch current batches
          const batchesRes = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: 'Batches!A2:G'
          });
          const rows = batchesRes.data.values || [];

          const parseNum = (val: any) => {
              if (val === undefined || val === null) return 0;
              const str = String(val).replace(/,/g, '').trim();
              const n = Number(str);
              return isNaN(n) ? 0 : n;
          };

          const allBatches = rows.map((row, index) => ({
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
          const batchUpdates: any[] = [];
          
          // Track state in memory
          const localBatches = allBatches.map(b => ({...b}));

          // We need calculateFIFO here. Since we can't easily import it without potential side effects in this environment, 
          // I will implement a simplified version or just the core logic here.
          // Actually, I'll use the same logic as src/lib/fifoEngine.ts
          
          for (const req of (Array.isArray(issues) ? issues : [issues])) {
              const { itemId, qty: qtyRequested, itemName, deptName, deptId, date } = req;
              
              const itemBatches = localBatches
                .filter(b => b.itemId === itemId && b.remainingQty > 0)
                .sort((a, b) => {
                    const getPriority = (batch: any) => {
                        if (batch.id.startsWith('B_OPEN_') || batch.source === 'Opening') return 0;
                        if (batch.id.startsWith('B_REV_') || (batch.source && batch.source.startsWith('Reversal'))) return 1;
                        return 2;
                    };
                    const pA = getPriority(a); const pB = getPriority(b);
                    if (pA !== pB) return pA - pB;
                    const dateA = new Date(a.date).getTime();
                    const dateB = new Date(b.date).getTime();
                    return (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
                });

              const totalAvailable = Math.round(itemBatches.reduce((sum, b) => sum + b.remainingQty, 0) * 10000) / 10000;
              if (totalAvailable < qtyRequested) {
                  results.push({ success: false, error: `Insufficient stock for ${itemName || itemId}. Available: ${totalAvailable}, Requested: ${qtyRequested}`, itemId });
                  continue;
              }

              let remainingToIssue = qtyRequested;
              let totalCost = 0;
              const consumedFromIssues = [];

              for (const batch of itemBatches) {
                  if (remainingToIssue <= 0) break;
                  const consumed = Math.round(Math.min(batch.remainingQty, remainingToIssue) * 10000) / 10000;
                  const newRemaining = Math.round((batch.remainingQty - consumed) * 10000) / 10000;
                  
                  totalCost += consumed * batch.cost;
                  remainingToIssue = Math.round((remainingToIssue - consumed) * 10000) / 10000;
                  
                  // Update local state
                  batch.remainingQty = newRemaining;
                  consumedFromIssues.push({ rowIndex: batch.rowIndex, consumed, newRemaining });
                  
                  // Add to batch updates to be sent to Google Sheets
                  batchUpdates.push({
                      range: `Batches!E${batch.rowIndex}:E${batch.rowIndex}`,
                      values: [[newRemaining]]
                  });
              }

              const issueId = `ISS_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
              const avgRate = totalCost / qtyRequested;
              
              issueRows.push([issueId, date, deptId, itemId, qtyRequested, avgRate, userEmail]);
              auditRows.push([new Date().toISOString(), userEmail || "System", 'ISSUE_STOCK', 'Issues', `Issued ${qtyRequested} of item ${itemName || itemId} to dept ${deptName || deptId}`]);
              
              results.push({ success: true, issueId, avgRate, totalCost, itemId });
          }

          // 2. Execute all modifications in one go (or in parallel)
          const promises = [];
          if (batchUpdates.length > 0) {
              promises.push(sheets.spreadsheets.values.batchUpdate({
                  spreadsheetId,
                  requestBody: { valueInputOption: 'USER_ENTERED', data: batchUpdates }
              }));
          }
          if (issueRows.length > 0) {
              promises.push(sheets.spreadsheets.values.append({
                  spreadsheetId,
                  range: 'Issues!A:G',
                  valueInputOption: 'USER_ENTERED',
                  requestBody: { values: issueRows }
              }));
          }
          if (auditRows.length > 0) {
              promises.push(sheets.spreadsheets.values.append({
                  spreadsheetId,
                  range: 'AuditLogs!A:E',
                  valueInputOption: 'USER_ENTERED',
                  requestBody: { values: auditRows }
              }));
          }

          await Promise.all(promises);
          res.json({ results });

      } catch (error: any) {
          console.error("Atomic Issue Failed:", error);
          res.status(500).json({ error: error.message });
      } finally {
          release();
      }
  });

  app.post("/api/auth/me", async (req, res) => {
    const { tokens } = req.body;
    if (!tokens) return res.status(401).json({ error: "Missing tokens" });

    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });

    try {
      const userInfo = await oauth2.userinfo.get();
      res.json(userInfo.data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GEMINI SMART REORDER PREDICTIONS
  app.post("/api/gemini/reorder-predictions", async (req, res) => {
    const { items } = req.body;
    if (!items) {
      return res.status(400).json({ error: "Missing items data" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "GEMINI_API_KEY environment variable is not configured. Please add it in Settings > Secrets." });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const itemsSummary = items.map((itm: any) => ({
        id: itm.id,
        name: itm.name,
        unit: itm.unit,
        currentStock: itm.stock,
        minParLevel: itm.minParLevel,
        defaultReorderQty: itm.reorderQty,
        qty7Days: itm.qty7Days || 0,
        qty14Days: itm.qty14Days || 0,
        qty30Days: itm.qty30Days || 0,
        averageDailyConsumption: itm.averageDailyConsumption || 0,
        lastIssueDate: itm.lastIssueDate || "None"
      }));

      const prompt = `
You are an expert restaurant inventory optimization AI.
Analyze the following compiled stock trends and pre-calculated average daily consumption rate for each restaurant item to predict future reorder needs and prevent stockouts:

JSON Items and Consumption Data:
${JSON.stringify(itemsSummary, null, 2)}

Calculate / Predict:
1. Days remaining of stock: currentStock / averageDailyConsumption (If averageDailyConsumption is 0, set daysRemaining to 999).
2. If daysRemaining is less than 7 days OR currentStock is below minParLevel, recommend a suggestedReorderQty to restore healthy stocks and cover next week's anticipated consumption. If the stock is healthy, suggestedReorderQty should be 0.
3. Weigh the raw velocity trends: Is consumption spiking recently (7-day rate higher than 30-day rate) or declining?
4. Set a level of confidence (High, Medium, Low) and provide a concise 1-sentence reasoning (e.g., "7-day spike indicates rising demand, recommendation covers next 10 days of service.").

Return the predictions array wrapped in a single JSON object. Do not include any markdown format blocks.
`;

      const modelsToTry = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
      let finalData: any = null;
      let lastError: any = null;

      for (const modelName of modelsToTry) {
        let attempts = 2;
        while (attempts > 0) {
          try {
            console.log(`[Gemini API] Attempting prediction with model ${modelName} (${attempts} attempts remaining for this model)`);
            const response = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    predictions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          itemId: { type: Type.STRING },
                          averageDailyConsumption: { type: Type.NUMBER },
                          daysRemaining: { type: Type.NUMBER },
                          suggestedReorderQty: { type: Type.NUMBER },
                          confidence: { type: Type.STRING },
                          reasoning: { type: Type.STRING }
                        },
                        required: ["itemId", "averageDailyConsumption", "daysRemaining", "suggestedReorderQty", "confidence", "reasoning"]
                      }
                    }
                  },
                  required: ["predictions"]
                }
              }
            });

            const responseText = response.text || "{}";
            finalData = JSON.parse(responseText);
            break; // Success! Break inner loop
          } catch (err: any) {
            lastError = err;
            console.warn(`[Gemini API] Attempt with ${modelName} failed. error:`, err.message || err);
            attempts--;
            if (attempts > 0) {
              // Wait 1 second before retrying
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
        if (finalData) {
          break; // Success! Break outer model loop
        }
      }

      if (finalData) {
        res.json(finalData);
      } else {
        console.warn("[Gemini API] All model attempts failed. Falling back to robust offline deterministic predictions.");
        const predictions = itemsSummary.map((itm: any) => {
          const avgDaily = itm.averageDailyConsumption || 0;
          const daysRemaining = avgDaily > 0 ? Number((itm.currentStock / avgDaily).toFixed(1)) : 999;
          
          let suggestedReorderQty = 0;
          let confidence = "Medium";
          let reasoning = "";

          const isBelowPar = itm.currentStock < itm.minParLevel;
          const isAtRiskOfDepletion = daysRemaining < 7;

          if (isBelowPar || isAtRiskOfDepletion) {
            confidence = avgDaily > 0 ? "High" : "Low";
            const deficit = Math.max(0, itm.minParLevel - itm.currentStock);
            const cover7Days = Math.ceil(avgDaily * 7);
            const rawRecommendation = Math.max(itm.defaultReorderQty || 0, deficit + cover7Days);
            suggestedReorderQty = rawRecommendation || 5;

            if (isBelowPar && isAtRiskOfDepletion && avgDaily > 0) {
              reasoning = `Under min par level of ${itm.minParLevel} ${itm.unit} and depleting within ${daysRemaining} days due to service consumption. Restocking suggested.`;
            } else if (isBelowPar) {
              reasoning = `Current stock (${itm.currentStock} ${itm.unit}) is below par level (${itm.minParLevel} ${itm.unit}). Restocking suggested to secure par level.`;
            } else {
              reasoning = `Anticipated stock depletion in ${daysRemaining} days based on daily velocity. Suggest proactive replenishment.`;
            }
          } else {
            confidence = avgDaily > 0 ? "High" : "Medium";
            suggestedReorderQty = 0;
            if (avgDaily > 0) {
              reasoning = `Stock levels are healthy with approx ${daysRemaining} days left at current velocity. No immediate reordering required.`;
            } else {
              reasoning = `Stock of ${itm.currentStock} ${itm.unit} is secure and shows no active depletion trends. No action required.`;
            }
          }

          return {
            itemId: String(itm.id),
            averageDailyConsumption: Number(avgDaily.toFixed(3)),
            daysRemaining,
            suggestedReorderQty: Number(suggestedReorderQty.toFixed(1)),
            confidence,
            reasoning
          };
        });

        res.json({ predictions });
      }
    } catch (error: any) {
      console.error("Gemini Reorder Prediction Failed:", error);
      res.status(500).json({ error: error.message || "Prediction failed to compile. Please try again." });
    }
  });

  // --- End API Routes ---

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
