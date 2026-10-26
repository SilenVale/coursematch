import { beijingToIso, type ExtractUpdate } from "./extract.js";
import { sanitizeSingleInstructor } from "./instructor-slots.js";

function clockToIso(value: string): string | undefined {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return undefined;
  return beijingToIso(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]));
}

function asText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text || text.length > max) return undefined;
  return text;
}

/** 把模型返回的 JSON 收成槽位。无法识别的字段丢掉。 */
export function normalizeModelJson(raw: unknown): ExtractUpdate {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const update: ExtractUpdate = {};
  const title = asText(body.title, 40);
  if (title) update.title = title;
  const description = asText(body.description, 200);
  if (description) update.description = description;
  const deadline = asText(body.deadline, 32);
  if (deadline) {
    const iso = clockToIso(deadline);
    if (iso) update.deadlineAt = iso;
  }
  const start = asText(body.start, 32);
  if (start) {
    const iso = clockToIso(start);
    if (iso) update.startAt = iso;
  }
  if (body.maxPreferences === 1 || body.maxPreferences === 2 || body.maxPreferences === 3) {
    update.maxPreferences = body.maxPreferences;
  }
  const roster = asText(body.rosterText, 8000);
  if (roster) update.rosterText = roster;
  const courseName = asText(body.courseName, 30);
  if (courseName) update.courseName = courseName;
  const instructor = sanitizeSingleInstructor(asText(body.instructor, 20));
  if (instructor) update.instructor = instructor;
  const schedule = asText(body.schedule, 40);
  if (schedule) update.schedule = schedule;
  if (body.courseAmbiguous === true) update.courseAmbiguous = true;
  if (typeof body.capacity === "number" && Number.isInteger(body.capacity) && body.capacity > 0 && body.capacity <= 999) {
    update.capacity = body.capacity;
  }
  return update;
}
