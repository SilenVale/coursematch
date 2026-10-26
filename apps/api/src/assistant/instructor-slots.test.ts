import { describe, expect, it } from "vitest";
import {
  looksLikeMultipleInstructors,
  parseTeachersInText,
  sanitizeSingleInstructor,
} from "./instructor-slots.js";

describe("instructor-slots", () => {
  it("rejects merged instructors", () => {
    expect(looksLikeMultipleInstructors("李老师、刘老师")).toBe(true);
    expect(sanitizeSingleInstructor("李老师、刘老师")).toBeUndefined();
    expect(sanitizeSingleInstructor("李老师")).toBe("李老师");
  });

  it("parses two teachers from continuous text", () => {
    expect(parseTeachersInText("李老师刘老师分别教")).toEqual(["李老师", "刘老师"]);
  });
});
