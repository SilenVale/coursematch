import type { ActivityPhase, ActivitySummary, Lifecycle } from "@coursematch/shared";
import { PHASE_LABEL } from "./configUi";

export function phaseLabel(phase: ActivityPhase): string {
  return PHASE_LABEL[phase];
}

export function teacherNextAction(item: ActivitySummary): { label: string; to: string } {
  const base = `/teacher/courses/${item.activityId}`;
  if (item.lifecycle === "DRAFT") {
    return { label: "继续配置", to: `${base}/configure` };
  }
  if (item.phase === "FILLING" || item.phase === "NOT_STARTED") {
    return { label: "管理选课", to: `${base}/configure` };
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
  return { label: "打开", to: `${base}/configure` };
}

export function lifecycleShort(lifecycle: Lifecycle, phase: ActivityPhase): string {
  return phaseLabel(phase);
}
