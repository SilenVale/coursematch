import { assistantConfig } from "./config.js";

export type LlmKeySource = "server" | "browser" | "none";

export interface LlmRuntime {
  url: string;
  model: string;
  timeoutMs: number;
  serverKey: string | null;
}

/** 服务端密钥与可选代理地址，仅通过环境变量配置，勿写入仓库。 */
export function readLlmRuntime(): LlmRuntime {
  const serverKey = process.env.DEEPSEEK_API_KEY?.trim() || null;
  const url = process.env.DEEPSEEK_API_URL?.trim() || assistantConfig.url;
  const model = process.env.DEEPSEEK_MODEL?.trim() || assistantConfig.model;
  return {
    url,
    model,
    timeoutMs: assistantConfig.timeoutMs,
    serverKey,
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

export function llmStatusForTeachers(): { llmReady: boolean; llmSource: LlmKeySource } {
  const runtime = readLlmRuntime();
  if (runtime.serverKey) return { llmReady: true, llmSource: "server" };
  return { llmReady: false, llmSource: "none" };
}
