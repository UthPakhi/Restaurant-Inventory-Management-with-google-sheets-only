import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export default async function handler(req: any, res: any) {
  const { code, state } = req.query;

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
    res.send(`
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
    `);
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).send("Authentication failed.");
  }
}