import { describe, expect, it } from "vitest";
import { pickTopicId } from "./dev-trial-lib.js";

const TOPICS = ["t-a", "t-b", "t-c"];

describe("pickTopicId", () => {
  it("same_first 始终第一个", () => {
    expect(pickTopicId("same_first", TOPICS, 0, "20260001")).toBe("t-a");
    expect(pickTopicId("same_first", TOPICS, 99, "20260099")).toBe("t-a");
  });

  it("round_robin 按序号轮询", () => {
    expect(pickTopicId("round_robin", TOPICS, 0, "a")).toBe("t-a");
    expect(pickTopicId("round_robin", TOPICS, 1, "b")).toBe("t-b");
    expect(pickTopicId("round_robin", TOPICS, 3, "d")).toBe("t-a");
  });

  it("random 对同一学号稳定", () => {
    const a = pickTopicId("random", TOPICS, 0, "20262001");
    const b = pickTopicId("random", TOPICS, 5, "20262001");
    expect(a).toBe(b);
    expect(TOPICS).toContain(a);
  });
});
