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
