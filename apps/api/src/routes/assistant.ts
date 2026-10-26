import type { FastifyPluginAsync } from "fastify";
import { runAgent } from "../assistant/agent.js";
import { executeAction } from "../assistant/execute.js";
import { llmStatusForTeachers, readLlmRuntime, resolveLlmKey } from "../assistant/llm-env.js";
import { probeLlm } from "../assistant/llm.js";
import { upsertSiteLlmInDb } from "../assistant/llm-secret-db.js";
import { writeServerKeyFile, writeServerLlmOptionsFile } from "../assistant/llm-secret-file.js";
import { pool } from "../db/pool.js";
import type { ChatTurn } from "../assistant/memory.js";
import { emptyDraft, type AssistantDraft } from "../assistant/model.js";
import { step } from "../assistant/turn.js";
import { fail, ok } from "../lib/response.js";

interface TurnBody {
  message?: string;
  draft?: AssistantDraft | null;
  history?: ChatTurn[];
  preferences?: string[];
}

export const assistantRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/assistant/llm-status", async (req, reply) => {
    if (!req.actor) {
      const { status, body } = fail("UNAUTHENTICATED", "请先登录", 401);
      return reply.code(status).send(body);
    }
    if (req.actor.role !== "TEACHER") {
      const { status, body } = fail("ROLE_FORBIDDEN", "当前角色无权执行此操作", 403);
      return reply.code(status).send(body);
    }
    return ok(llmStatusForTeachers());
  });

  app.put<{ Body: { apiKey?: string; apiUrl?: string; model?: string } }>(
    "/api/assistant/llm-config",
    async (req, reply) => {
      if (!req.actor) {
        const { status, body } = fail("UNAUTHENTICATED", "请先登录", 401);
        return reply.code(status).send(body);
      }
      if (req.actor.role !== "TEACHER") {
        const { status, body } = fail("ROLE_FORBIDDEN", "当前角色无权执行此操作", 403);
        return reply.code(status).send(body);
      }
      const runtime = readLlmRuntime();
      if (runtime.serverKeyStore === "env") {
        const { status, body } = fail("CONFIG_LOCKED", "已在环境变量中配置模型密钥，请在部署平台修改", 409);
        return reply.code(status).send(body);
      }
      const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
      if (!apiKey) {
        const { status, body } = fail("INVALID_INPUT", "请填写 API Key", 400);
        return reply.code(status).send(body);
      }
      const url =
        typeof req.body?.apiUrl === "string" && req.body.apiUrl.trim()
          ? req.body.apiUrl.trim()
          : runtime.url;
      const model =
        typeof req.body?.model === "string" && req.body.model.trim()
          ? req.body.model.trim()
          : runtime.model;
      try {
        await probeLlm(apiKey, url, model);
      } catch (err) {
        const message = err instanceof Error ? err.message : "DeepSeek 没有连上";
        const { status, body } = fail("INVALID_INPUT", message, 400);
        return reply.code(status).send(body);
      }
      const savedUrl = typeof req.body?.apiUrl === "string" ? req.body.apiUrl.trim() : "";
      const savedModel = typeof req.body?.model === "string" ? req.body.model.trim() : "";
      const resolvedUrl = savedUrl || url;
      const resolvedModel = savedModel || model;
      await upsertSiteLlmInDb(pool, { apiKey, apiUrl: resolvedUrl, model: resolvedModel });
      writeServerKeyFile(apiKey);
      writeServerLlmOptionsFile({ apiUrl: resolvedUrl, model: resolvedModel });
      if (savedUrl) process.env.DEEPSEEK_API_URL = savedUrl;
      if (savedModel) process.env.DEEPSEEK_MODEL = savedModel;
      return ok({ llmReady: true, llmSource: "server", serverKeyStore: "db" });
    },
  );

  app.post<{ Body: TurnBody }>("/api/assistant/turns", async (req, reply) => {
    if (!req.actor) {
      const { status, body } = fail("UNAUTHENTICATED", "请先登录", 401);
      return reply.code(status).send(body);
    }
    if (req.actor.role !== "TEACHER") {
      const { status, body } = fail("ROLE_FORBIDDEN", "当前角色无权执行此操作", 403);
      return reply.code(status).send(body);
    }

    const message = typeof req.body?.message === "string" ? req.body.message : "";
    const current = req.body?.draft ?? emptyDraft();
    const now = new Date();
    const headerKey = req.headers["x-coursematch-model-key"];
    const { key: apiKey } = resolveLlmKey(typeof headerKey === "string" ? headerKey : undefined);
    let planned;
    if (apiKey) {
      try {
        planned = await runAgent({
          apiKey,
          message,
          draft: current,
          history: req.body?.history,
          preferences: req.body?.preferences,
          now,
        });
      } catch (err) {
        const reply =
          err instanceof Error && err.message.startsWith("DeepSeek ") ? err.message : "DeepSeek 没有连上";
        return ok({ draft: current, reply, confirm: null, execute: null });
      }
    } else {
      planned = step(current, message, now);
    }
    if (!planned.execute) return ok(planned);

    const executed = await executeAction(app, req, planned.execute, planned.draft);
    return ok({
      draft: executed.draft,
      reply: executed.reply,
      confirm: null,
      execute: null,
    });
  });
};
