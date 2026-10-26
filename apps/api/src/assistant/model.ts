/** 教师选课助理的对话草稿。活动记录仍以数据库为准，这里只在确认前攒槽位。 */

export type ConfirmAction = "create" | "publish" | "provision" | "freeze" | "allocate";

export type AwaitingSlot =
  | "title"
  | "deadline"
  | "start"
  | "maxPreferences"
  | "roster"
  | "courseName"
  | "instructor"
  | "schedule"
  | "capacity";

export type AssistantLifecycle = "NONE" | "DRAFT" | "PUBLISHED" | "ALLOCATED";

export interface AssistantTopic {
  courseName: string;
  instructor: string;
  schedule: string;
  capacity: number | null;
}

export interface AssistantDraft {
  activityId: string | null;
  configVersion: number | null;
  lifecycle: AssistantLifecycle;
  title: string;
  description: string;
  startAt: string | null;
  deadlineAt: string | null;
  maxPreferences: number | null;
  rosterText: string;
  rosterWritten: boolean;
  topic: AssistantTopic;
  topicWritten: boolean;
  pending: ConfirmAction | null;
  /** 上一句问的是哪一项。模型据此理解老师的短回答。 */
  awaiting: AwaitingSlot | null;
}

export interface ConfirmCard {
  action: ConfirmAction;
  summary: string[];
}

export interface TurnResult {
  draft: AssistantDraft;
  reply: string;
  confirm: ConfirmCard | null;
  /** 老师已对 pending 明确确认，路由层才允许调用现有接口。 */
  execute: ConfirmAction | null;
}

export function emptyDraft(): AssistantDraft {
  return {
    activityId: null,
    configVersion: null,
    lifecycle: "NONE",
    title: "",
    description: "",
    startAt: null,
    deadlineAt: null,
    maxPreferences: null,
    rosterText: "",
    rosterWritten: false,
    topic: { courseName: "", instructor: "", schedule: "", capacity: null },
    topicWritten: false,
    pending: null,
    awaiting: null,
  };
}

export function isConfirmMessage(message: string): boolean {
  return /^\s*确认(创建|发布|冻结|主分配|分配|开通账号)?\s*[。！!]?\s*$/.test(message);
}

export function isCancelMessage(message: string): boolean {
  return /^\s*(先别|取消|先不要)\s*[。！!]?\s*$/.test(message);
}
