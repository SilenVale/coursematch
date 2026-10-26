import { afterEach, describe, expect, it } from "vitest";
import { llmStatusForTeachers, resolveLlmKey } from "./llm-env.js";

describe("LLM 密钥来源", () => {
  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
  });

  it("服务端配置了密钥时，教师端视为已就绪", () => {
    process.env.DEEPSEEK_API_KEY = "sk-server";
    expect(llmStatusForTeachers()).toEqual({ llmReady: true, llmSource: "server", serverKeyStore: "env" });
    expect(resolveLlmKey("sk-browser")).toEqual({ key: "sk-server", source: "server" });
  });

  it("未配置服务端密钥时，才使用浏览器传来的密钥", () => {
    expect(llmStatusForTeachers()).toEqual({ llmReady: false, llmSource: "none", serverKeyStore: "none" });
    expect(resolveLlmKey("sk-browser")).toEqual({ key: "sk-browser", source: "browser" });
    expect(resolveLlmKey(undefined)).toEqual({ key: "", source: "none" });
  });
});
