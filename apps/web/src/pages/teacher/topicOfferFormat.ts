/** 在 topic.description 中结构化存储教师/时间/地点（无需改库）。 */

export type OfferFields = {
  instructor: string;
  schedule: string;
  room: string;
  courseNote: string;
};

const PREFIX = {
  instructor: "授课教师：",
  schedule: "上课时间：",
  room: "上课地点：",
} as const;

export function packOfferDescription(fields: OfferFields): string {
  const lines: string[] = [];
  if (fields.instructor.trim()) lines.push(`${PREFIX.instructor}${fields.instructor.trim()}`);
  if (fields.schedule.trim()) lines.push(`${PREFIX.schedule}${fields.schedule.trim()}`);
  if (fields.room.trim()) lines.push(`${PREFIX.room}${fields.room.trim()}`);
  const head = lines.join("\n");
  const note = fields.courseNote.trim();
  if (!head) return note;
  if (!note) return head;
  return `${head}\n\n${note}`;
}

export function unpackOfferDescription(description: string): OfferFields {
  const empty: OfferFields = {
    instructor: "",
    schedule: "",
    room: "",
    courseNote: "",
  };
  if (!description.trim()) return empty;

  const lines = description.split("\n");
  let i = 0;
  const read = (prefix: string): string | null => {
    if (i >= lines.length) return null;
    const line = lines[i];
    if (line.startsWith(prefix)) {
      i += 1;
      return line.slice(prefix.length).trim();
    }
    return null;
  };

  const instructor = read(PREFIX.instructor);
  const schedule = read(PREFIX.schedule);
  const room = read(PREFIX.room);

  if (instructor !== null || schedule !== null || room !== null) {
    while (i < lines.length && lines[i].trim() === "") i += 1;
    const courseNote = lines.slice(i).join("\n").trim();
    return {
      instructor: instructor ?? "",
      schedule: schedule ?? "",
      room: room ?? "",
      courseNote,
    };
  }

  return { ...empty, courseNote: description.trim() };
}

/** 列表展示用一行摘要 */
export function offerSummaryLine(fields: OfferFields, fallbackTitle: string): string {
  const parts: string[] = [];
  if (fields.instructor) parts.push(fields.instructor);
  else if (fallbackTitle) parts.push(fallbackTitle);
  if (fields.schedule) parts.push(fields.schedule);
  if (fields.room) parts.push(fields.room);
  return parts.join(" · ") || fallbackTitle;
}

export function buildOfferTitle(instructor: string, courseName: string): string {
  const name = courseName.trim();
  const teacher = instructor.trim();
  if (name && teacher) return `${teacher} · ${name}`;
  if (name) return name;
  if (teacher) return `${teacher}的课程`;
  return "未命名课程";
}
