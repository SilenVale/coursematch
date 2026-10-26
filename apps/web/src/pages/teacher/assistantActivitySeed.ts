import type { ActivityView, TeacherTopicView } from "@coursematch/shared";
import type { AssistantDraft } from "./assistantSessionStorage";

function parseOfferTitle(title: string): { instructor: string; courseName: string } {
  const parts = title.split("·").map((part) => part.trim());
  if (parts.length >= 2) {
    return { instructor: parts[0], courseName: parts.slice(1).join("·") };
  }
  return { instructor: "", courseName: title.trim() };
}

function scheduleFromDescription(description: string): string {
  const line = description
    .split("\n")
    .map((row) => row.trim())
    .find((row) => row.startsWith("上课时间："));
  return line?.replace(/^上课时间：/, "").trim() ?? "";
}

export function draftFromExistingActivity(
  activity: ActivityView,
  topics: TeacherTopicView[],
): AssistantDraft {
  const first = topics[0];
  const parsed = first ? parseOfferTitle(first.title) : { instructor: "", courseName: "" };
  const schedule = first ? scheduleFromDescription(first.description) : "";
  return {
    activityId: activity.activityId,
    configVersion: activity.configVersion,
    lifecycle: activity.lifecycle === "DRAFT" ? "DRAFT" : activity.lifecycle === "ALLOCATED" ? "ALLOCATED" : "PUBLISHED",
    title: activity.title,
    description: activity.description ?? "",
    startAt: activity.startAt,
    deadlineAt: activity.deadlineAt,
    maxPreferences: activity.maxPreferences,
    rosterText: "",
    rosterWritten: true,
    topic: {
      courseName: parsed.courseName,
      instructor: parsed.instructor,
      schedule,
      capacity: first?.capacity ?? null,
    },
    topicWritten: topics.length > 0,
    pending: null,
    pendingAddTopic: null,
    awaiting: null,
  };
}
