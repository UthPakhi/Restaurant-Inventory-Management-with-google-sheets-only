import express from "express";
import serverless from "serverless-http";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Google OAuth Config
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const CALLBACK_HTML = (tokens: any) => `
  <html>
    <head><meta http-equiv="Cross-Origin-Opener-Policy" content="unsafe-none"></head>
    <body>
      <script>
        const tokens = ${JSON.stringify(tokens)};
        try { if (window.opener) window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens }, '*'); } catch(e) {}
        try { const bc = new BroadcastChannel('google_auth_channel'); bc.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens }); setTimeout(() => bc.close(), 500); } catch(e) {}
        try { localStorage.setItem('GOOGLE_AUTH_TOKENS', JSON.stringify(tokens)); } catch(e) {}
        setTimeout(() => window.close(), 300);
      </script>
      <div style="font-family:sans-serif;text-align:center;padding:50px;">
        <h2>Authentication Successful!</h2>
        <p>You can safely close this window.</p>
        <button onclick="window.close()" style="padding:10px 20px;font-size:16px;background:#000;color:#fff;border:none;border-radius:6px;cursor:pointer;">Close Window</button>
      </div>
    </body>
  </html>
`;

// ─── INTERCEPT CALLBACK BEFORE routePath MANGLING ───────────────────────────
// When Vercel rewrites /api/auth/callback?code=xxx to /api/index?routePath=auth/callback&code=xxx
// we catch it here FIRST before the routePath middleware touches the URL
app.get("/api/index", async (req, res, next) => {
  if (req.query.routePath !== 'auth/callback') return next();

  const { code, state } = req.query;
  if (!code) return res.status(400).send("Missing code");

  let redirectUri = process.env.GOOGLE_REDIRECT_URI!;
  if (state) {
    try {
      const parsed = JSON.parse(state as string);
      if (parsed.r) redirectUri = parsed.r;
    } catch (e) {}
  }

  try {
    const { tokens } = await oauth2Client.getToken({
      code: code as string,
      redirect_uri: redirectUri,
    });

    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
    res.send(CALLBACK_HTML(tokens));
  } catch (error: any) {
    console.error("Auth callback error:", error);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// ─── routePath RESTORER ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.query.routePath) {
    const routePath = req.query.routePath as string;
    const remaining = { ...req.query };
    delete remaining.routePath; // Remove routePath from query params
    const qStr = new URLSearchParams(remaining as any).toString();
    req.url = '/api/' + routePath + (qStr ? '?' + qStr : '');
  }
  next();
});

// ─── ROUTES ──────────────────────────────────────────────────────────────────

app.get(["/api/health", "/health"], (req, res) => {
  res.json({ status: "ok" });
});

app.get(["/api/auth/google/url", "/auth/google/url"], (req, res) => {
  const scopes = [
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    state: JSON.stringify({ r: process.env.GOOGLE_REDIRECT_URI }),
  });

  res.json({ url });
});

app.get(["/api/auth/callback", "/auth/callback"], async (req, res) => {
  // This route handles local dev where there's no Vercel rewriting
  const { code, state } = req.query;
  if (!code) return res.status(400).send("Missing code");

  let redirectUri = process.env.GOOGLE_REDIRECT_URI!;
  if (state) {
    try {
      const parsed = JSON.parse(state as string);
      if (parsed.r) redirectUri = parsed.r;
    } catch (e) {}
  }

  try {
    const { tokens } = await oauth2Client.getToken({
      code: code as string,
      redirect_uri: redirectUri,
    });

    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
    res.send(CALLBACK_HTML(tokens));
  } catch (error: any) {
    console.error("Auth callback error:", error);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

app.post(["/api/sheets/create", "/sheets/create"], async (req, res) => {
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

app.post(["/api/sheets/batchUpdate", "/sheets/batchUpdate"], async (req, res) => {
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

app.post(["/api/sheets/append", "/sheets/append"], async (req, res) => {
  const { tokens, spreadsheetId, range, values } = req.body;
  oauth2Client.setCredentials(tokens);
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post(["/api/sheets/read", "/sheets/read"], async (req, res) => {
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

app.post(["/api/sheets/update", "/sheets/update"], async (req, res) => {
  const { tokens, spreadsheetId, range, values } = req.body;
  oauth2Client.setCredentials(tokens);
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  try {
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post(["/api/sheets/valuesBatchUpdate", "/sheets/valuesBatchUpdate"], async (req, res) => {
  const { tokens, spreadsheetId, data } = req.body;
  oauth2Client.setCredentials(tokens);
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  try {
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
  }
});

app.post(["/api/sheets/batchClear", "/sheets/batchClear"], async (req, res) => {
  const { tokens, spreadsheetId, ranges } = req.body;
  oauth2Client.setCredentials(tokens);
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  try {
    const response = await sheets.spreadsheets.values.batchClear({
      spreadsheetId,
      requestBody: { ranges }
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post(["/api/auth/me", "/auth/me"], async (req, res) => {
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

export default app;
export const handler = serverless(app);