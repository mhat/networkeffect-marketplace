import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

export interface Credentials {
  url: string;
  token: string;
  bot_username: string;
  bot_display_name: string;
  account_type: "bot_collective" | "bot_individual";
  created_at: string;
}

export const CREDENTIALS_PATH = join(homedir(), ".config", "networkeffect", "credentials.json");

export function loadCredentials(): Credentials | null {
  try {
    const data = readFileSync(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(data) as Credentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Omit<Credentials, "created_at">): void {
  const dir = dirname(CREDENTIALS_PATH);
  mkdirSync(dir, { recursive: true });

  const full: Credentials = {
    ...creds,
    created_at: new Date().toISOString(),
  };

  writeFileSync(CREDENTIALS_PATH, JSON.stringify(full, null, 2) + "\n", { mode: 0o600 });
}

export function deleteCredentials(): boolean {
  try {
    unlinkSync(CREDENTIALS_PATH);
    return true;
  } catch {
    return false;
  }
}

export function resolveConfig(): { url: string; token: string } | null {
  const envToken = process.env.NETWORKEFFECT_API_TOKEN;
  const envUrl = process.env.NETWORKEFFECT_API_URL;

  if (envToken) {
    return {
      url: envUrl || "https://networkeffect.dev",
      token: envToken,
    };
  }

  const creds = loadCredentials();
  if (creds) {
    return {
      url: envUrl || creds.url,
      token: creds.token,
    };
  }

  return null;
}
