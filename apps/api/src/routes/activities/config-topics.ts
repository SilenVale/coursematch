/**
 * 石俊贤 · M2 题目与资格配置 —— 校验与行映射（不含路由）。
 *
 * 依赖迁移中的 `topic` 与 `topic_eligible_participant` 两张表。
 * 表结构提案见 PR 说明；本文件假定：
 *   topic(id, activity_id, title, description, tags text[], capacity,
 *         eligibility_mode, eligibility_description, created_at)
 *   topic_eligible_participant(topic_id, participant_id)
 */
import type {
  FieldError,
  TeacherTopicView,
  TopicFields,
  TopicInput,
  StudentTopicView,
} from "@coursematch/shared";

/** 与 contracts 的 TopicFields 对齐的列名。 */
export const TOPIC_FIELD_COLUMNS = {
  title: "title",
  description: "description",
  tags: "tags",
  capacity: "capacity",
  eligibilityDescription: "eligibility_description",
} as const;

export type TopicField = keyof typeof TOPIC_FIELD_COLUMNS;

export const MAX_TOPIC_TAGS = 8;
export const MAX_TAG_LENGTH = 24;

export interface TopicRow {
  id: string;
  activity_id: string;
  title: string;
  description: string;
  tags: string[] | null;
  capacity: number;
  eligibility_mode: "ALL" | "EXPLICIT";
  eligibility_description: string;
  created_at: Date;
  preference_count?: number;
}

/** 校验题目字段，返回字段错误与规范化后的值。 */
export function validateTopicFields(input: Partial<TopicFields>): {
  fieldErrors: FieldError[];
  values: Partial<TopicFields>;
} {
  const fieldErrors: FieldError[] = [];
  const values: Partial<TopicFields> = {};

  if (input.title !== undefined) {
    const title = String(input.title).trim();
    if (title.length === 0) {
      fieldErrors.push({ field: "title", code: "REQUIRED", message: "题目名称不能为空" });
    } else if (title.length > 200) {
      fieldErrors.push({ field: "title", code: "TOO_LONG", message: "题目名称最多 200 个字符" });
    } else {
      values.title = title;
    }
  }

  if (input.description !== undefined) {
    const description = String(input.description);
    if (description.length > 2000) {
      fieldErrors.push({
        field: "description",
        code: "TOO_LONG",
        message: "题目简介最多 2000 个字符",
      });
    } else {
      values.description = description;
    }
  }

  if (input.capacity !== undefined) {
    const capacity = Number(input.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) {
      fieldErrors.push({
        field: "capacity",
        code: "OUT_OF_RANGE",
        message: "名额必须是正整数",
      });
    } else if (capacity > 1000) {
      fieldErrors.push({
        field: "capacity",
        code: "OUT_OF_RANGE",
        message: "名额不能超过 1000",
      });
    } else {
      values.capacity = capacity;
    }
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) {
      fieldErrors.push({ field: "tags", code: "INVALID_FORMAT", message: "标签必须是数组" });
    } else {
      const cleaned: string[] = [];
      for (const raw of input.tags) {
        const tag = String(raw).trim();
        if (tag === "") continue;
        if (tag.length > MAX_TAG_LENGTH) {
          fieldErrors.push({
            field: "tags",
            code: "TOO_LONG",
            message: `单个标签最多 ${MAX_TAG_LENGTH} 个字符：${tag}`,
          });
          continue;
        }
        if (!cleaned.includes(tag)) cleaned.push(tag);
      }
      if (cleaned.length > MAX_TOPIC_TAGS) {
        fieldErrors.push({
          field: "tags",
          code: "TOO_MANY",
          message: `最多 ${MAX_TOPIC_TAGS} 个标签`,
        });
      } else {
        values.tags = cleaned;
      }
    }
  }

  if (input.eligibilityDescription !== undefined) {
    const text = String(input.eligibilityDescription);
    if (text.length > 500) {
      fieldErrors.push({
        field: "eligibilityDescription",
        code: "TOO_LONG",
        message: "资格说明最多 500 个字符",
      });
    } else {
      values.eligibilityDescription = text;
    }
  }

  return { fieldErrors, values };
}

/**
 * 校验资格模式与名单。
 *
 * `EXPLICIT` 必须给出至少一个 participantId；`ALL` 不接受名单
 * （契约里 `eligibleParticipantIds?: []`，即必须为空）。
 */
export function validateEligibility(input: {
  eligibilityMode?: unknown;
  eligibleParticipantIds?: unknown;
}): { fieldErrors: FieldError[]; mode?: "ALL" | "EXPLICIT"; ids?: string[] } {
  const fieldErrors: FieldError[] = [];

  if (input.eligibilityMode === undefined) return { fieldErrors };

  if (input.eligibilityMode !== "ALL" && input.eligibilityMode !== "EXPLICIT") {
    fieldErrors.push({
      field: "eligibilityMode",
      code: "INVALID_FORMAT",
      message: "资格模式只能是 ALL 或 EXPLICIT",
    });
    return { fieldErrors };
  }

  const mode = input.eligibilityMode;
  const rawIds = input.eligibleParticipantIds;

  if (mode === "ALL") {
    if (Array.isArray(rawIds) && rawIds.length > 0) {
      fieldErrors.push({
        field: "eligibleParticipantIds",
        code: "INVALID_FORMAT",
        message: "资格模式为 ALL 时不能指定限定名单",
      });
      return { fieldErrors };
    }
    return { fieldErrors, mode, ids: [] };
  }

  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    fieldErrors.push({
      field: "eligibleParticipantIds",
      code: "REQUIRED",
      message: "资格模式为 EXPLICIT 时必须至少指定一名学生",
    });
    return { fieldErrors };
  }

  const ids: string[] = [];
  for (const raw of rawIds) {
    const id = String(raw).trim();
    if (id === "") continue;
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) {
    fieldErrors.push({
      field: "eligibleParticipantIds",
      code: "REQUIRED",
      message: "资格模式为 EXPLICIT 时必须至少指定一名学生",
    });
    return { fieldErrors };
  }

  return { fieldErrors, mode, ids };
}

/** 创建时的整体校验（TopicCreateInput = TopicInput & ConfigVersionInput）。 */
export function validateTopicCreate(
  input: Partial<TopicInput> & { expectedConfigVersion?: number },
): {
  fieldErrors: FieldError[];
  values: Partial<TopicFields> & { eligibilityMode?: "ALL" | "EXPLICIT"; ids?: string[] };
} {
  const { fieldErrors, values } = validateTopicFields(input);
  const eligibility = validateEligibility(input);
  fieldErrors.push(...eligibility.fieldErrors);

  const missing: FieldError[] = [];
  if (values.title === undefined) {
    missing.push({ field: "title", code: "REQUIRED", message: "title 为必填" });
  }
  if (values.capacity === undefined) {
    missing.push({ field: "capacity", code: "REQUIRED", message: "capacity 为必填" });
  }
  if (input.eligibilityMode === undefined) {
    missing.push({
      field: "eligibilityMode",
      code: "REQUIRED",
      message: "eligibilityMode 为必填",
    });
  }

  return {
    fieldErrors: [...fieldErrors, ...missing],
    values: {
      ...values,
      eligibilityMode: eligibility.mode,
      ids: eligibility.ids,
    },
  };
}

/** 数据库行 → 教师视角视图（含限定名单）。 */
export function toTeacherTopicView(row: TopicRow, eligibleParticipantIds: string[]): TeacherTopicView {
  return {
    topicId: row.id,
    title: row.title,
    description: row.description,
    tags: row.tags ?? [],
    capacity: row.capacity,
    eligibilityMode: row.eligibility_mode,
    eligibilityDescription: row.eligibility_description,
    heat: { preferenceCount: row.preference_count ?? 0 },
    eligibleParticipantIds: row.eligibility_mode === "EXPLICIT" ? eligibleParticipantIds : [],
  };
}

/** 学生视角：不暴露限定名单，只给 canChoose。 */
export function toStudentTopicView(
  row: TopicRow,
  eligibleParticipantIds: string[],
  participantId: string,
): StudentTopicView {
  return {
    topicId: row.id,
    title: row.title,
    description: row.description,
    tags: row.tags ?? [],
    capacity: row.capacity,
    eligibilityMode: row.eligibility_mode,
    eligibilityDescription: row.eligibility_description,
    heat: { preferenceCount: row.preference_count ?? 0 },
    canChoose:
      row.eligibility_mode === "ALL" || eligibleParticipantIds.includes(participantId),
  };
}


