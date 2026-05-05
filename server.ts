import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import dotenv from "dotenv";

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
        if (url.hostname.endsWith(".run.app") || url.hostname.endsWith("vercel.app")) {
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
      prompt: "consent",
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
                if (window.opener && !window.opener.closed) {
                  window.opener.postMessage(authResult, '*');
                  window.close();
                } else {
                  localStorage.setItem('resto_oauth_result', JSON.stringify(authResult));
                  window.location.href = '/';
                }
              } catch (e) {
                  localStorage.setItem('resto_oauth_result', JSON.stringify(authResult));
                  window.location.href = '/';
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
          res.status(500).json({ error: error.message });
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
