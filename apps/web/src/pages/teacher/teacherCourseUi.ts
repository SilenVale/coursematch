import type { ActivityPhase, ActivitySummary, Lifecycle } from "@coursematch/shared";
import { PHASE_LABEL } from "./configUi";

/** 教师端进入 configure 页的统一入口文案。 */
export const CONFIGURE_NAV_LABEL = "继续配置（课程设置）";

export function teacherConfigurePath(activityId: string, fromAssistant = false): string {
  const base = `/teacher/courses/${activityId}/configure`;
  return fromAssistant ? `${base}?from=assistant` : base;
}

export function phaseLabel(phase: ActivityPhase): string {
  return PHASE_LABEL[phase];
}

export function teacherNextAction(item: ActivitySummary): { label: string; to: string } {
  const base = `/teacher/courses/${item.activityId}`;
  if (item.lifecycle === "DRAFT") {
    return { label: CONFIGURE_NAV_LABEL, to: `${base}/configure` };
  }
  if (item.phase === "FILLING" || item.phase === "NOT_STARTED") {
    return { label: CONFIGURE_NAV_LABEL, to: `${base}/configure` };
  }
  if (item.phase === "DEADLINE_REACHED") {
    return { label: "冻结与分配", to: `${base}/results` };
  }
  if (item.lifecycle === "ALLOCATED") {
    return { label: "查看结果", to: `${base}/results` };
  }
  if (item.lifecycle === "CLOSED" || item.lifecycle === "VOID") {
    return { label: "查看记录", to: `${base}/results` };
  }
  return { label: CONFIGURE_NAV_LABEL, to: `${base}/configure` };
}

export function lifecycleShort(lifecycle: Lifecycle, phase: ActivityPhase): string {
  return phaseLabel(phase);
}

export function isAssistantCreateSuccessReply(text: string): boolean {
  const t = text.trim();
  return t.startsWith("草稿已创建") || (t.startsWith("已添加 ") && t.includes("继续配置"));
}
