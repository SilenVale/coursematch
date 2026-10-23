/**
 * 石俊贤 · M2 活动配置 —— 五列 CSV 名单的纯函数部分（不碰数据库，可单测）。
 *
 * 名单固定五列：学号、姓名、入学年、专业、班级。
 * 本文件只做「解析 + 逐行校验 + 与现有名单求差」，写入由 config.ts 在事务里完成。
 */
import type {
  ConfirmedIdentity,
  FieldError,
  RowError,
  RosterPreview,
  RosterPreviewRow,
} from "@coursematch/shared";

/** 名单最多行数，防止一次导入把请求拖死。 */
export const MAX_ROSTER_ROWS = 5000;

/** 逐行错误最多回报多少条，超出截断，避免超大响应。 */
export const MAX_ROW_ERRORS = 100;

/** 五列的列名，仅用于错误提示。 */
const COLUMN_NAMES = ["学号", "姓名", "入学年", "专业", "班级"] as const;

/** 首行命中这些值时视为表头，跳过。 */
const HEADER_FIRST_CELLS = new Set([
  "学号",
  "studentnumber",
  "student_number",
  "studentno",
  "student_no",
]);

export interface RosterRow extends ConfirmedIdentity {
  /** 该行在文件中的逻辑行号（1 起，含表头行）。 */
  rowNumber: number;
}

export type RosterParseResult =
  | { ok: true; rows: RosterRow[] }
  | { ok: false; rowErrors: RowError[] };

/**
 * 把 CSV 文本切成二维单元格数组。
 * 支持：UTF-8 BOM、CRLF/CR/LF 三种换行、双引号包裹、`""` 转义、单元格内逗号。
 * 全空白的行会被丢弃，不计入结果。
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      endCell();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (src[i + 1] === "\n") i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  if (cell.length > 0 || row.length > 0) endRow();

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function isHeaderRow(cells: string[]): boolean {
  const first = (cells[0] ?? "").trim().toLowerCase();
  return HEADER_FIRST_CELLS.has(first);
}

function required(
  errors: RowError[],
  rowNumber: number,
  field: string,
  value: string,
  columnLabel: string,
): boolean {
  if (value !== "") return true;
  errors.push({
    rowNumber,
    field,
    code: "REQUIRED",
    message: `第 ${rowNumber} 行：${columnLabel}不能为空`,
  });
  return false;
}

/**
 * 解析并逐行校验五列名单。
 *
 * 任一行有问题就整体返回失败（`ok: false`），调用方不得写入任何数据——
 * 这是「导入失败不破坏已生效名单」的第一道保险。
 */
export function parseRoster(text: string): RosterParseResult {
  const rawRows = parseCsv(text);

  if (rawRows.length === 0) {
    return {
      ok: false,
      rowErrors: [
        {
          rowNumber: 1,
          field: "file",
          code: "EMPTY",
          message: "名单文件为空，或没有任何有效数据行",
        },
      ],
    };
  }

  const startIndex = isHeaderRow(rawRows[0]) ? 1 : 0;
  const dataRowCount = rawRows.length - startIndex;

  if (dataRowCount === 0) {
    return {
      ok: false,
      rowErrors: [
        {
          rowNumber: 1,
          field: "file",
          code: "EMPTY",
          message: "名单只有表头，没有数据行",
        },
      ],
    };
  }

  if (dataRowCount > MAX_ROSTER_ROWS) {
    return {
      ok: false,
      rowErrors: [
        {
          rowNumber: 1,
          field: "file",
          code: "TOO_MANY_ROWS",
          message: `名单最多 ${MAX_ROSTER_ROWS} 行，当前 ${dataRowCount} 行`,
        },
      ],
    };
  }

  const rowErrors: RowError[] = [];
  const rows: RosterRow[] = [];
  const seenStudentNumbers = new Map<string, number>();

  for (let idx = startIndex; idx < rawRows.length; idx += 1) {
    const cells = rawRows[idx];
    const rowNumber = idx + 1;
    const errorsBefore = rowErrors.length;

    if (cells.length !== COLUMN_NAMES.length) {
      rowErrors.push({
        rowNumber,
        field: "file",
        code: "COLUMN_COUNT",
        message: `第 ${rowNumber} 行：必须是 5 列（学号,姓名,入学年,专业,班级），当前 ${cells.length} 列`,
      });
      continue;
    }

    const studentNumber = cells[0].trim();
    const name = cells[1].trim();
    const enrollmentYear = cells[2].trim();
    const major = cells[3].trim();
    const className = cells[4].trim();

    required(rowErrors, rowNumber, "studentNumber", studentNumber, "学号");
    required(rowErrors, rowNumber, "name", name, "姓名");
    const hasYear = required(
      rowErrors,
      rowNumber,
      "enrollmentYear",
      enrollmentYear,
      "入学年",
    );
    required(rowErrors, rowNumber, "major", major, "专业");
    required(rowErrors, rowNumber, "className", className, "班级");

    if (hasYear && !/^\d{4}$/.test(enrollmentYear)) {
      rowErrors.push({
        rowNumber,
        field: "enrollmentYear",
        code: "INVALID_FORMAT",
        message: `第 ${rowNumber} 行：入学年必须是 4 位数字，当前为「${enrollmentYear}」`,
      });
    }

    if (studentNumber !== "") {
      const firstSeenAt = seenStudentNumbers.get(studentNumber);
      if (firstSeenAt !== undefined) {
        rowErrors.push({
          rowNumber,
          field: "studentNumber",
          code: "DUPLICATE",
          message: `第 ${rowNumber} 行：学号 ${studentNumber} 与第 ${firstSeenAt} 行重复`,
        });
      } else {
        seenStudentNumbers.set(studentNumber, rowNumber);
      }
    }

    if (rowErrors.length === errorsBefore) {
      rows.push({
        rowNumber,
        studentNumber,
        name,
        enrollmentYear,
        major,
        className,
      });
    }
  }

  if (rowErrors.length > 0) {
    return { ok: false, rowErrors: rowErrors.slice(0, MAX_ROW_ERRORS) };
  }

  return { ok: true, rows };
}

/**
 * 学号在全局档案里已存在、但五列信息对不上时的冲突。
 *
 * `student_profile` 是全库共享的，静默覆盖会改到其他活动的名单，
 * 因此这里报错交给教师确认，而不是直接更新。
 */
export function detectProfileConflicts(
  incoming: RosterRow[],
  existingProfiles: ConfirmedIdentity[],
): RowError[] {
  const byNumber = new Map(existingProfiles.map((p) => [p.studentNumber, p]));
  const errors: RowError[] = [];

  for (const row of incoming) {
    const existing = byNumber.get(row.studentNumber);
    if (!existing) continue;

    const mismatched: string[] = [];
    if (existing.name !== row.name) mismatched.push("姓名");
    if (existing.enrollmentYear !== row.enrollmentYear) mismatched.push("入学年");
    if (existing.major !== row.major) mismatched.push("专业");
    if (existing.className !== row.className) mismatched.push("班级");
    if (mismatched.length === 0) continue;

    errors.push({
      rowNumber: row.rowNumber,
      field: "studentNumber",
      code: "PROFILE_MISMATCH",
      message: `第 ${row.rowNumber} 行：学号 ${row.studentNumber} 已存在于学生档案，但${mismatched.join("、")}与档案不一致`,
    });
  }

  return errors.slice(0, MAX_ROW_ERRORS);
}

/** 对比「当前名单」与「待导入名单」，产出预览。不写库。 */
export function buildRosterPreview(params: {
  configVersion: number;
  existing: ConfirmedIdentity[];
  incoming: RosterRow[];
}): RosterPreview {
  const existingNumbers = new Set(params.existing.map((p) => p.studentNumber));
  const incomingNumbers = new Set(params.incoming.map((r) => r.studentNumber));

  const rows: RosterPreviewRow[] = params.incoming.map((row) => ({
    rowNumber: row.rowNumber,
    studentNumber: row.studentNumber,
    name: row.name,
    enrollmentYear: row.enrollmentYear,
    major: row.major,
    className: row.className,
    change: existingNumbers.has(row.studentNumber) ? "RETAINED" : "ADDED",
  }));

  const addedCount = rows.filter((r) => r.change === "ADDED").length;
  const retainedCount = rows.length - addedCount;
  const removedCount = params.existing.filter(
    (p) => !incomingNumbers.has(p.studentNumber),
  ).length;

  return {
    configVersion: params.configVersion,
    addedCount,
    removedCount,
    retainedCount,
    rows,
  };
}

/** 契约里 `FieldError` 的便捷构造，给请求体级（非逐行）错误用。 */
export function fieldError(field: string, code: string, message: string): FieldError {
  return { field, code, message };
}
