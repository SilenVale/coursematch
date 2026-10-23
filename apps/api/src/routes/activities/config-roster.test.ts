import { describe, expect, it } from "vitest";
import {
  buildRosterPreview,
  detectProfileConflicts,
  MAX_ROSTER_ROWS,
  parseCsv,
  parseRoster,
} from "./config-roster.js";

const HEADER = "学号,姓名,入学年,专业,班级";
const ROW_A = "20260001,演示学生甲,2026,软件工程,1班";
const ROW_B = "20260002,演示学生乙,2026,软件工程,1班";

describe("parseCsv", () => {
  it("解析标准五列", () => {
    expect(parseCsv(`${HEADER}\n${ROW_A}`)).toEqual([
      ["学号", "姓名", "入学年", "专业", "班级"],
      ["20260001", "演示学生甲", "2026", "软件工程", "1班"],
    ]);
  });

  it("兼容 CRLF 与 BOM", () => {
    const text = `\uFEFF${HEADER}\r\n${ROW_A}\r\n`;
    expect(parseCsv(text)).toHaveLength(2);
  });

  it("丢弃全空白行", () => {
    expect(parseCsv(`${ROW_A}\n\n   \n${ROW_B}`)).toHaveLength(2);
  });

  it("支持引号包裹的逗号与转义双引号", () => {
    const cells = parseCsv('20260003,"张三, 李四",2026,"软件""工程""","1班"');
    expect(cells[0]).toEqual(["20260003", "张三, 李四", "2026", '软件"工程"', "1班"]);
  });

  it("支持单元格内换行", () => {
    const cells = parseCsv('20260004,"张\n三",2026,软件工程,1班');
    expect(cells[0][1]).toBe("张\n三");
  });
});

describe("parseRoster", () => {
  it("跳过表头并保留行号", () => {
    const result = parseRoster(`${HEADER}\n${ROW_A}\n${ROW_B}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((r) => r.rowNumber)).toEqual([2, 3]);
    expect(result.rows[0].studentNumber).toBe("20260001");
  });

  it("没有表头也能解析", () => {
    const result = parseRoster(ROW_A);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].rowNumber).toBe(1);
  });

  it("空文件报 EMPTY", () => {
    const result = parseRoster("");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rowErrors[0].code).toBe("EMPTY");
  });

  it("只有表头报 EMPTY", () => {
    const result = parseRoster(HEADER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rowErrors[0].code).toBe("EMPTY");
  });

  it("列数不对报 COLUMN_COUNT 且不返回任何行", () => {
    const result = parseRoster(`${ROW_A}\n20260002,演示学生乙`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rowErrors).toHaveLength(1);
    expect(result.rowErrors[0]).toMatchObject({ rowNumber: 2, code: "COLUMN_COUNT" });
  });

  it("必填为空报 REQUIRED", () => {
    const result = parseRoster("20260003,,2026,软件工程,1班");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rowErrors[0]).toMatchObject({
      rowNumber: 1,
      field: "name",
      code: "REQUIRED",
    });
  });

  it("入学年非四位数字报 INVALID_FORMAT", () => {
    const result = parseRoster("20260003,张三,26,软件工程,1班");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rowErrors[0].code).toBe("INVALID_FORMAT");
  });

  it("学号重复报 DUPLICATE 并指出首次出现的行号", () => {
    const result = parseRoster(`${ROW_A}\n${ROW_A}`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rowErrors[0]).toMatchObject({ rowNumber: 2, code: "DUPLICATE" });
    expect(result.rowErrors[0].message).toContain("第 1 行");
  });

  it("多行多错误一次性全部返回", () => {
    const result = parseRoster(`${ROW_A}\n20260002,,2026,软件工程,1班\nbad,row`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rowErrors).toHaveLength(2);
  });

  it("超过行数上限报 TOO_MANY_ROWS", () => {
    const rows = Array.from(
      { length: MAX_ROSTER_ROWS + 1 },
      (_, i) => `S${String(i).padStart(6, "0")},学生${i},2026,软件工程,1班`,
    );
    const result = parseRoster(rows.join("\n"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rowErrors[0].code).toBe("TOO_MANY_ROWS");
  });
});

describe("detectProfileConflicts", () => {
  const incoming = [
    {
      rowNumber: 2,
      studentNumber: "20260001",
      name: "演示学生甲",
      enrollmentYear: "2026",
      major: "软件工程",
      className: "1班",
    },
  ];

  it("信息完全一致时不报冲突", () => {
    expect(
      detectProfileConflicts(incoming, [
        {
          studentNumber: "20260001",
          name: "演示学生甲",
          enrollmentYear: "2026",
          major: "软件工程",
          className: "1班",
        },
      ]),
    ).toEqual([]);
  });

  it("档案已存在但姓名不同时报 PROFILE_MISMATCH", () => {
    const errors = detectProfileConflicts(incoming, [
      {
        studentNumber: "20260001",
        name: "另一个人",
        enrollmentYear: "2026",
        major: "软件工程",
        className: "1班",
      },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ rowNumber: 2, code: "PROFILE_MISMATCH" });
    expect(errors[0].message).toContain("姓名");
  });

  it("全新学号不报冲突", () => {
    expect(detectProfileConflicts(incoming, [])).toEqual([]);
  });
});

describe("buildRosterPreview", () => {
  it("区分新增与保留，并统计移除", () => {
    const preview = buildRosterPreview({
      configVersion: 3,
      existing: [
        {
          studentNumber: "20260001",
          name: "演示学生甲",
          enrollmentYear: "2026",
          major: "软件工程",
          className: "1班",
        },
        {
          studentNumber: "20269999",
          name: "将被移除",
          enrollmentYear: "2026",
          major: "软件工程",
          className: "1班",
        },
      ],
      incoming: [
        {
          rowNumber: 2,
          studentNumber: "20260001",
          name: "演示学生甲",
          enrollmentYear: "2026",
          major: "软件工程",
          className: "1班",
        },
        {
          rowNumber: 3,
          studentNumber: "20260002",
          name: "演示学生乙",
          enrollmentYear: "2026",
          major: "软件工程",
          className: "1班",
        },
      ],
    });

    expect(preview.configVersion).toBe(3);
    expect(preview.addedCount).toBe(1);
    expect(preview.retainedCount).toBe(1);
    expect(preview.removedCount).toBe(1);
    expect(preview.rows.map((r) => r.change)).toEqual(["RETAINED", "ADDED"]);
  });

  it("空名单全为新增", () => {
    const preview = buildRosterPreview({
      configVersion: 0,
      existing: [],
      incoming: [
        {
          rowNumber: 1,
          studentNumber: "20260001",
          name: "甲",
          enrollmentYear: "2026",
          major: "软件工程",
          className: "1班",
        },
      ],
    });
    expect(preview.addedCount).toBe(1);
    expect(preview.removedCount).toBe(0);
    expect(preview.retainedCount).toBe(0);
  });
});
