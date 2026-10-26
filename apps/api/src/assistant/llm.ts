import { assistantConfig } from "./config.js";

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

/** 模型封装。教学示例里的模拟模型，这里换成 DeepSeek 的对话接口。 */
export async function completeChat(apiKey: string, messages: LlmMessage[]): Promise<string> {
  const response = await fetch(assistantConfig.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: assistantConfig.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages,
    }),
    signal: AbortSignal.timeout(assistantConfig.timeoutMs),
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("DeepSeek 密钥无效");
    throw new Error("DeepSeek 没有连上");
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return payload.choices?.[0]?.message?.content ?? "";
}
