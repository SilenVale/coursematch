import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = path.join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

export function serverKeyFilePath(): string {
  return process.env.DEEPSEEK_API_KEY_FILE?.trim() || path.join(API_ROOT, ".data", "deepseek-api-key");
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
