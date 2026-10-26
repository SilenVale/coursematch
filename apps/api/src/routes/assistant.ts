import type { FastifyPluginAsync } from "fastify";
import { runAgent } from "../assistant/agent.js";
import { executeAction } from "../assistant/execute.js";
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
    const apiKey = typeof headerKey === "string" ? headerKey.trim() : "";
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
