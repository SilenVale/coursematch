import { describe, expect, it } from "vitest";
import { calculateAllocation } from "./calculate.js";
import type { FrozenInput } from "./types.js";

const JIA = "topic-jia";
const YI = "topic-yi";

function fixture(): FrozenInput {
  const all = [JIA, YI];
  return {
    activityId: "act-demo",
    maxPreferences: 3,
    topics: [
      { topicId: JIA, capacity: 1 },
      { topicId: YI, capacity: 1 },
    ],
    participants: [
      {
        participantId: "A",
        lotteryNumber: 3,
        orderedTopicIds: [JIA],
        eligibleTopicIds: all,
      },
      {
        participantId: "B",
        lotteryNumber: 2,
        orderedTopicIds: [YI, JIA],
        eligibleTopicIds: all,
      },
      {
        participantId: "C",
        lotteryNumber: 1,
        orderedTopicIds: [YI],
        eligibleTopicIds: all,
      },
      {
        participantId: "D",
        lotteryNumber: 4,
        orderedTopicIds: [],
        eligibleTopicIds: all,
      },
    ],
  };
}

describe("calculateAllocation", () => {
  it("matches the fixed A/B/C/D sample", () => {
    const batch = calculateAllocation(fixture());
    const byId = new Map(batch.results.map((r) => [r.participantId, r]));
    expect(byId.get("A")).toMatchObject({
      status: "ASSIGNED",
      topicId: JIA,
      matchedRank: 1,
    });
    expect(byId.get("C")).toMatchObject({
      status: "ASSIGNED",
      topicId: YI,
      matchedRank: 1,
    });
    expect(byId.get("B")).toMatchObject({
      status: "UNALLOCATED",
      topicId: null,
    });
    expect(byId.get("D")).toMatchObject({
      status: "NOT_SUBMITTED",
      topicId: null,
    });
  });

  it("is deterministic on repeat", () => {
    const a = calculateAllocation(fixture());
    const b = calculateAllocation(fixture());
    expect(a).toEqual(b);
  });
});
