/** 可选课按「一位教师 · 一门课」一条记录；禁止把多位教师写进同一 instructor。 */

export function looksLikeMultipleInstructors(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/[、,，/|]/.test(text)) return true;
  if (/和|与/.test(text) && /老师/.test(text)) {
    const teachers = text.match(/[^\s、，,和与]{1,8}老师/g);
    if (teachers && teachers.length > 1) return true;
  }
  return false;
}

export function sanitizeSingleInstructor(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || looksLikeMultipleInstructors(trimmed)) return undefined;
  return trimmed;
}

/** 从自然语言里抽出「李老师」「刘老师」等，去重保序。 */
function surnameBeforeTeacher(segment: string): string | null {
  const viaShi = segment.match(/是([\u4e00-\u9fff]{1,2})$/);
  if (viaShi) return viaShi[1];
  const m = segment.match(/([\u4e00-\u9fff]{1,2})$/);
  if (!m) return null;
  const surname = m[1];
  if (/^(思|意|的|我|想|说|由|为)$/.test(surname)) return null;
  if (surname.length === 2 && /[的是我思意加再新增添请找和与还就]/.test(surname[0])) return null;
  return surname;
}

export function parseTeachersInText(text: string): string[] {
  const segments = text.split("老师");
  if (segments.length < 2) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < segments.length - 1; i += 1) {
    const surname = surnameBeforeTeacher(segments[i]);
    if (!surname) continue;
    const name = `${surname}老师`;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function primaryInstructorField(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (looksLikeMultipleInstructors(trimmed)) {
    return parseTeachersInText(trimmed)[0] ?? trimmed;
  }
  return trimmed;
}
