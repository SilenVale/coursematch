import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = path.join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

function dataDir(): string {
  const keyFile = process.env.DEEPSEEK_API_KEY_FILE?.trim();
  if (keyFile) return path.dirname(keyFile);
  return path.join(API_ROOT, ".data");
}

export function serverKeyFilePath(): string {
  return process.env.DEEPSEEK_API_KEY_FILE?.trim() || path.join(dataDir(), "deepseek-api-key");
}

function serverOptionsFilePath(): string {
  return path.join(dataDir(), "deepseek-llm-options.json");
}

export interface ServerLlmOptions {
  apiUrl?: string;
  model?: string;
}

export function readServerLlmOptionsFile(): ServerLlmOptions {
  const file = serverOptionsFilePath();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as ServerLlmOptions;
    return {
      apiUrl: typeof parsed.apiUrl === "string" ? parsed.apiUrl.trim() : undefined,
      model: typeof parsed.model === "string" ? parsed.model.trim() : undefined,
    };
  } catch {
    return {};
  }
}

export function writeServerLlmOptionsFile(options: ServerLlmOptions): void {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = serverOptionsFilePath();
  const payload: ServerLlmOptions = {};
  if (options.apiUrl?.trim()) payload.apiUrl = options.apiUrl.trim();
  if (options.model?.trim()) payload.model = options.model.trim();
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function readServerKeyFile(): string | null {
  const file = serverKeyFilePath();
  try {
    const text = fs.readFileSync(file, "utf8").trim();
    return text || null;
  } catch {
    return null;
  }
}

/** 密钥只写入服务端本地文件，不进入日志与响应。Render 免费盘不持久，生产仍建议用环境变量。 */
export function writeServerKeyFile(apiKey: string): void {
  const file = serverKeyFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${apiKey.trim()}\n`, { encoding: "utf8", mode: 0o600 });
}

export function clearServerKeyFile(): boolean {
  const file = serverKeyFilePath();
  try {
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}
