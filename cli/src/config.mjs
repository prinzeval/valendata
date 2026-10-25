// Where the CLI finds its API key and server.
//   key:    VALENDATA_API_KEY, else the file `valendata login` saved (~/.config/valendata/config.json)
//   server: VALENDATA_API_URL, else production
// The key is never printed.

import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_API_URL = "https://api.valendata.com";

export function configPath(env = process.env) {
  const base = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "valendata", "config.json");
}

export async function readConfig(env = process.env) {
  try {
    return JSON.parse(await readFile(configPath(env), "utf8"));
  } catch {
    return {};
  }
}

export async function saveApiKey(apiKey, env = process.env) {
  const path = configPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ ...(await readConfig(env)), apiKey }, null, 2) + "\n", { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

export async function resolveSettings(env = process.env) {
  const saved = await readConfig(env);
  return {
    apiKey: env.VALENDATA_API_KEY || saved.apiKey || null,
    apiUrl: (env.VALENDATA_API_URL || saved.apiUrl || DEFAULT_API_URL).replace(/\/$/, ""),
  };
}
