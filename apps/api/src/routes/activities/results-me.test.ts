import { describe, expect, it } from "vitest";
import { mapAllocationRowToResultFields } from "./results-me-map.js";

describe("mapAllocationRowToResultFields", () => {
  it("映射已分配", () => {
    expect(
      mapAllocationRowToResultFields({
        status: "ASSIGNED",
        topic_id: "t1",
        matched_rank: 1,
        lottery_number: 3,
        rounds: [],
      }),
    ).toEqual({
      status: "ASSIGNED",
      topicId: "t1",
      matchedRank: 1,
      lotteryNumber: 3,
      rounds: [],
    });
  });

  it("映射全落选与未提交", () => {
    expect(
      mapAllocationRowToResultFields({
        status: "UNALLOCATED",
        topic_id: null,
        matched_rank: null,
        lottery_number: 2,
        rounds: [],
      }).status,
    ).toBe("UNALLOCATED");

    expect(
      mapAllocationRowToResultFields({
        status: "NOT_SUBMITTED",
        topic_id: null,
        matched_rank: null,
        lottery_number: 4,
        rounds: [],
      }).status,
    ).toBe("NOT_SUBMITTED");
  });
});
