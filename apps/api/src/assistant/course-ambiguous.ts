import type { AssistantDraft } from "./model.js";
import { parseTeachersInText } from "./instructor-slots.js";
import type { ExtractUpdate } from "./extract.js";

/** 两个「名额 N」是否应视为两门课（而非双教师共用一个名额）。 */
export function extractMarksTwoCourses(text: string): boolean {
  const capacities = [...text.matchAll(/名额\s*(\d+)/g)];
  if (capacities.length <= 1) return false;
  const nums = capacities.map((m) => Number(m[1]));
  const allSame = nums.every((n) => n === nums[0]);
  if (allSame && parseTeachersInText(text).length >= 2) return false;
  return true;
}

export function stripFalseCourseAmbiguous(
  draft: AssistantDraft,
  message: string,
  update: ExtractUpdate,
): ExtractUpdate {
  if (!update.courseAmbiguous) return update;
  if (draft.pendingAddTopic?.instructor) {
    const { courseAmbiguous: _drop, ...rest } = update;
    return rest;
  }
  if (!extractMarksTwoCourses(message)) {
    const { courseAmbiguous: _drop, ...rest } = update;
    return rest;
  }
  return update;
}
