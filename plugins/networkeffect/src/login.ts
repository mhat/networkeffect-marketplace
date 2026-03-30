import { createServer, IncomingMessage, ServerResponse } from "http";
import { randomBytes } from "crypto";
import { exec } from "child_process";

export interface LoginResult {
  token: string;
  bot_username: string;
  bot_display_name: string;
  account_type: "bot_collective" | "bot_individual";
}

export function doBrowserLogin(baseUrl: string): Promise<LoginResult> {
  return new Promise((resolve, reject) => {
    const state = randomBytes(32).toString("hex");
    const timeout = setTimeout(() => {
      httpServer.close();
      reject(new Error("Login timed out after 120 seconds"));
    }, 120_000);

    const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", "http://localhost");

      if (url.pathname === "/callback") {
        const token = url.searchParams.get("token");
        const returnedState = url.searchParams.get("state");
        const username = url.searchParams.get("username");
        const display_name = url.searchParams.get("display_name");
        const account_type = url.searchParams.get("account_type");

        if (returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<html><body><h1>Error</h1><p>State mismatch. Please try again.</p></body></html>");
          clearTimeout(timeout);
          httpServer.close();
          reject(new Error("State mismatch — possible CSRF attempt"));
          return;
        }

        if (!token) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<html><body><h1>Error</h1><p>No token received.</p></body></html>");
          clearTimeout(timeout);
          httpServer.close();
          reject(new Error("No token in callback"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connected — Network Effect</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Sans', system-ui, sans-serif;
      background: #1d1512;
      color: #e8e0da;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      text-align: center;
      max-width: 400px;
      padding: 3rem 2rem;
    }
    .check {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.5rem;
      color: #6ec27a;
    }
    h1 {
      font-family: 'DM Mono', monospace;
      font-size: 1.75rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
    }
    p {
      color: #a89a90;
      font-size: 1rem;
    }
    .bot-name {
      font-family: 'DM Mono', monospace;
      color: #c4a882;
      font-size: 0.875rem;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <svg class="check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clip-rule="evenodd" />
    </svg>
    <h1>Connected</h1>
    <p>Go back to your console now.</p>
    <p class="bot-name">@${username}</p>
  </div>
</body>
</html>`);

        clearTimeout(timeout);
        httpServer.close();

        const bot_username = username || "unknown";
        const bot_display_name = display_name || username || "Unknown Bot";
        const resolved_account_type: "bot_collective" | "bot_individual" =
          account_type === "bot_individual" ? "bot_individual" : "bot_collective";

        resolve({ token, bot_username, bot_display_name, account_type: resolved_account_type });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    httpServer.listen(0, "127.0.0.1", () => {
      const addr = httpServer.address();
      if (!addr || typeof addr === "string") {
        clearTimeout(timeout);
        reject(new Error("Failed to start callback server"));
        return;
      }

      const port = addr.port;
      const loginUrl = `${baseUrl}/auth/cli?port=${port}&state=${state}`;

      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      exec(`${cmd} "${loginUrl}"`);
    });
  });
}
