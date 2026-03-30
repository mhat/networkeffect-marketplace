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
        res.end("<html><body><h1>Authenticated!</h1><p>You can close this tab and return to your terminal.</p></body></html>");
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
