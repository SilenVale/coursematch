import { assistantConfig } from "./config.js";
import { getSiteLlmCache } from "./llm-site-cache.js";
import { readServerKeyFile, readServerLlmOptionsFile } from "./llm-secret-file.js";

export type LlmKeySource = "server" | "browser" | "none";
export type ServerKeyStore = "env" | "db" | "file" | "none";

export interface LlmRuntime {
  url: string;
  model: string;
  timeoutMs: number;
  serverKey: string | null;
  serverKeyStore: ServerKeyStore;
}

/** 服务端密钥：环境变量优先，其次本地密钥文件（由教师在站点上配置，勿进仓库）。 */
export function readLlmRuntime(): LlmRuntime {
  const fromEnv = process.env.DEEPSEEK_API_KEY?.trim() || null;
  const fromDb = fromEnv ? null : getSiteLlmCache();
  const fromFile = fromEnv || fromDb ? null : readServerKeyFile();
  const serverKey = fromEnv || fromDb?.apiKey || fromFile;
  const fromFileOptions = fromFile ? readServerLlmOptionsFile() : {};
  const url =
    process.env.DEEPSEEK_API_URL?.trim() ||
    fromDb?.apiUrl ||
    fromFileOptions.apiUrl ||
    assistantConfig.url;
  const model =
    process.env.DEEPSEEK_MODEL?.trim() ||
    fromDb?.model ||
    fromFileOptions.model ||
    assistantConfig.model;
  const serverKeyStore: ServerKeyStore = fromEnv
    ? "env"
    : fromDb?.apiKey
      ? "db"
      : fromFile
        ? "file"
        : "none";
  return {
    url,
    model,
    timeoutMs: assistantConfig.timeoutMs,
    serverKey,
    serverKeyStore,
  };
}

/** 优先用部署方在服务端配置的密钥，浏览器密钥仅作本地覆盖。 */
export function resolveLlmKey(headerKey: string | undefined): { key: string; source: LlmKeySource } {
  const runtime = readLlmRuntime();
  if (runtime.serverKey) return { key: runtime.serverKey, source: "server" };
  const browser = typeof headerKey === "string" ? headerKey.trim() : "";
  if (browser) return { key: browser, source: "browser" };
  return { key: "", source: "none" };
}

export function llmStatusForTeachers(): {
  llmReady: boolean;
  llmSource: LlmKeySource;
  serverKeyStore: ServerKeyStore;
} {
  const runtime = readLlmRuntime();
  if (runtime.serverKey) {
    return { llmReady: true, llmSource: "server", serverKeyStore: runtime.serverKeyStore };
  }
  return { llmReady: false, llmSource: "none", serverKeyStore: "none" };
}
