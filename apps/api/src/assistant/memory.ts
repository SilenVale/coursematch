import { assistantConfig } from "./config.js";
import type { AssistantDraft } from "./model.js";

export interface ChatTurn {
  role: "teacher" | "assistant";
  text: string;
}

/** 三层记忆。短期和长期偏好只活在这一轮请求里，服务器不保存聊天记录。 */
export interface AssistantMemory {
  shortTerm: ChatTurn[];
  session: AssistantDraft;
  longTerm: string[];
}

export function remember(input: {
  draft: AssistantDraft;
  history?: ChatTurn[];
  preferences?: string[];
}): AssistantMemory {
  const shortTerm = (Array.isArray(input.history) ? input.history : [])
    .filter(
      (item) =>
        !!item &&
        (item.role === "teacher" || item.role === "assistant") &&
        typeof item.text === "string" &&
        item.text.trim().length > 0,
    )
    .slice(-assistantConfig.maxShortTerm);
  const longTerm = (Array.isArray(input.preferences) ? input.preferences : [])
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 80)
    .slice(0, 5);
  return { shortTerm, session: input.draft, longTerm };
}
