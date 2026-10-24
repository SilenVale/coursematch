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

  it("同一题目冲突时只按冻结 lotteryNumber 决定，不受输入顺序影响", () => {
    const input: FrozenInput = {
      activityId: "lottery-conflict",
      maxPreferences: 1,
      topics: [{ topicId: JIA, capacity: 1 }],
      participants: [
        {
          participantId: "later-in-lottery",
          lotteryNumber: 2,
          orderedTopicIds: [JIA],
          eligibleTopicIds: [JIA],
        },
        {
          participantId: "earlier-in-lottery",
          lotteryNumber: 1,
          orderedTopicIds: [JIA],
          eligibleTopicIds: [JIA],
        },
      ],
    };

    const byId = new Map(
      calculateAllocation(input).results.map((result) => [result.participantId, result]),
    );
    expect(byId.get("earlier-in-lottery")).toMatchObject({
      status: "ASSIGNED",
      topicId: JIA,
      matchedRank: 1,
    });
    expect(byId.get("later-in-lottery")).toMatchObject({
      status: "UNALLOCATED",
      topicId: null,
    });
  });

  it("混合提交场按轮次分配，并区分落选与未提交", () => {
    const input: FrozenInput = {
      activityId: "mixed-submissions",
      maxPreferences: 3,
      topics: [
        { topicId: JIA, capacity: 1 },
        { topicId: YI, capacity: 2 },
      ],
      participants: [
        {
          participantId: "A",
          lotteryNumber: 4,
          orderedTopicIds: [JIA, YI],
          eligibleTopicIds: [JIA, YI],
        },
        {
          participantId: "B",
          lotteryNumber: 2,
          orderedTopicIds: [JIA],
          eligibleTopicIds: [JIA, YI],
        },
        {
          participantId: "C",
          lotteryNumber: 1,
          orderedTopicIds: [YI],
          eligibleTopicIds: [JIA, YI],
        },
        {
          participantId: "D",
          lotteryNumber: 3,
          orderedTopicIds: [JIA, YI],
          eligibleTopicIds: [JIA, YI],
        },
        {
          participantId: "E",
          lotteryNumber: 5,
          orderedTopicIds: [],
          eligibleTopicIds: [JIA, YI],
        },
      ],
    };

    const batch = calculateAllocation(input);
    const byId = new Map(batch.results.map((result) => [result.participantId, result]));
    expect(byId.get("B")).toMatchObject({ status: "ASSIGNED", topicId: JIA, matchedRank: 1 });
    expect(byId.get("C")).toMatchObject({ status: "ASSIGNED", topicId: YI, matchedRank: 1 });
    expect(byId.get("D")).toMatchObject({ status: "ASSIGNED", topicId: YI, matchedRank: 2 });
    expect(byId.get("A")).toMatchObject({ status: "UNALLOCATED", topicId: null });
    expect(byId.get("E")).toMatchObject({ status: "NOT_SUBMITTED", topicId: null });
    expect(batch.topicStats).toEqual([
      { topicId: JIA, capacity: 1, assignedCount: 1, remainingSlots: 0 },
      { topicId: YI, capacity: 2, assignedCount: 2, remainingSlots: 0 },
    ]);
  });
});
