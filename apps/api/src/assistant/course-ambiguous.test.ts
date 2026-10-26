import { describe, expect, it } from "vitest";
import { extractMarksTwoCourses } from "./course-ambiguous.js";

describe("courseAmbiguous", () => {
  it("双教师同一名额不算两门课", () => {
    expect(extractMarksTwoCourses("李老师刘老师分别带班，名额30")).toBe(false);
    expect(extractMarksTwoCourses("热门课名额 1，普通课名额 30")).toBe(true);
  });
});
