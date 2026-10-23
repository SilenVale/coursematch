/**
 * 刘家铭 · M3 志愿的纯校验与状态判定。
 *
 * 本文件刻意不 import `pool`：`db/pool.ts` 在缺少 DATABASE_URL 时会在导入阶段抛错，
 * 混进来就没法单测（与 M2 的 config-topics.ts / config-topics-db.ts 拆分方式一致）。
 */
import type { ActivityPhase, ErrorCode, FieldError, Lifecycle } from "@coursematch/shared";

/** 契约与迁移里都写死的上限：max_preferences BETWEEN 1 AND 3。 */
export const HARD_MAX_PREFERENCES = 3;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 与 `read.ts` 的 derivePhase 保持同一套语义，但接受数据库时钟：
 * 截止判定必须用服务端时间，不能用浏览器时间。
 */
export function derivePhase(
  lifecycle: Lifecycle,
  startAt: Date,
  deadlineAt: Date,
  now: Date,
): ActivityPhase {
  if (lifecycle === "VOID") return "VOID";
  if (lifecycle === "CLOSED") return "CLOSED";
  if (lifecycle === "DRAFT") return "DRAFT";
  if (lifecycle === "ALLOCATED") return "ALLOCATED";
  if (now.getTime() < startAt.getTime()) return "NOT_STARTED";
  if (now.getTime() < deadlineAt.getTime()) return "FILLING";
  return "DEADLINE_REACHED";
}

export interface WriteBlock {
  code: ErrorCode;
  message: string;
  status: number;
}

/** 非 FILLING 阶段一律拒写；返回 null 表示可以写。 */
export function writeBlockedByPhase(phase: ActivityPhase): WriteBlock | null {
  switch (phase) {
    case "FILLING":
      return null;
    case "NOT_STARTED":
      return { code: "NOT_STARTED", message: "活动尚未开始填报", status: 409 };
    case "DEADLINE_REACHED":
    case "ALLOCATED":
      return {
        code: "DEADLINE_REACHED",
        message: "已过截止时间，志愿不能再修改",
        status: 409,
      };
    case "CLOSED":
      return { code: "ACTIVITY_CLOSED", message: "活动已关闭，志愿不能再修改", status: 409 };
    case "VOID":
      return { code: "ACTIVITY_VOID", message: "活动已作废，志愿不能再修改", status: 409 };
    case "DRAFT":
      // 草稿对学生不可见，调用方应先按「找不到」处理；这里兜底。
      return { code: "RESOURCE_NOT_FOUND", message: "活动不存在", status: 404 };
  }
}

export type PreferenceWriteParse =
  | { ok: true; topicIds: string[] }
  | { ok: false; fieldErrors: FieldError[] };

/**
 * 校验整单志愿：1～maxPreferences 个有序 topicId，不重复。
 * 空数组按「至少选一个」拒绝——第一版不做退选，未提交由「从未保存」表达。
 */
export function validatePreferenceWrite(
  payload: unknown,
  maxPreferences: number,
): PreferenceWriteParse {
  const fieldErrors: FieldError[] = [];

  if (typeof payload !== "object" || payload === null) {
    return {
      ok: false,
      fieldErrors: [{ field: "topicIds", code: "REQUIRED", message: "缺少志愿列表" }],
    };
  }

  const raw = (payload as { topicIds?: unknown }).topicIds;
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      fieldErrors: [{ field: "topicIds", code: "REQUIRED", message: "缺少志愿列表" }],
    };
  }

  const topicIds: string[] = [];
  raw.forEach((item, index) => {
    if (typeof item !== "string" || !UUID_PATTERN.test(item)) {
      fieldErrors.push({
        field: `topicIds[${index}]`,
        code: "INVALID_FORMAT",
        message: "志愿必须是题目 ID",
      });
      return;
    }
    topicIds.push(item);
  });

  if (new Set(topicIds).size !== topicIds.length) {
    fieldErrors.push({
      field: "topicIds",
      code: "DUPLICATE",
      message: "同一个题目不能出现在两个志愿位次",
    });
  }

  if (topicIds.length === 0) {
    fieldErrors.push({
      field: "topicIds",
      code: "REQUIRED",
      message: "至少选择 1 个题目；不保存即视为未提交",
    });
  }

  const limit = Math.min(maxPreferences, HARD_MAX_PREFERENCES);
  if (topicIds.length > limit) {
    fieldErrors.push({
      field: "topicIds",
      code: "OUT_OF_RANGE",
      message: `本活动最多保存 ${limit} 个志愿，当前提交 ${topicIds.length} 个`,
    });
  }

  if (fieldErrors.length > 0) return { ok: false, fieldErrors };
  return { ok: true, topicIds };
}

/** expectedVersion 是乐观锁：客户端提交它读到的版本号，0 表示「还没有保存过」。 */
export function validateExpectedVersion(value: unknown): FieldError[] {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return [
      {
        field: "expectedVersion",
        code: "REQUIRED",
        message: "缺少 expectedVersion（首次保存传 0）",
      },
    ];
  }
  return [];
}
