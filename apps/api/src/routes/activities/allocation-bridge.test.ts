import { describe, expect, it } from "vitest";
import type { FrozenInput } from "@coursematch/shared";
import { buildPersonalRounds, runAllocation, toEngineInput } from "./allocation-bridge.js";

const JIA = "topic-jia";
const YI = "topic-yi";

function minimalContract(
  participants: FrozenInput["participants"],
  submissions: FrozenInput["submissions"],
): FrozenInput {
  return {
    inputFormatVersion: 1,
    activityId: "act-test",
    configVersion: 1,
    title: "test",
    description: "",
    ruleVersion: "cm-rule-v1",
    maxPreferences: 3,
    startAt: "2026-01-01T00:00:00.000Z",
    deadlineAt: "2026-01-02T00:00:00.000Z",
    participants,
    topics: [
      {
        topicId: JIA,
        title: "甲",
        description: "",
        tags: [],
        capacity: 1,
        eligibilityDescription: "",
        eligibilityMode: "ALL",
        eligibleParticipantIds: [],
      },
      {
        topicId: YI,
        title: "乙",
        description: "",
        tags: [],
        capacity: 1,
        eligibilityDescription: "",
        eligibilityMode: "ALL",
        eligibleParticipantIds: [],
      },
    ],
    submissions,
  };
}

describe("buildPersonalRounds", () => {
  it("matches authoritative allocation for ABCD fixture", () => {
    const contract = minimalContract(
      [
        {
          participantId: "A",
          eligible: true,
          lotteryNumber: 3,
          confirmedIdentity: {
            studentNumber: "A",
            name: "A",
            enrollmentYear: "2026",
            major: "m",
            className: "c",
          },
        },
        {
          participantId: "B",
          eligible: true,
          lotteryNumber: 2,
          confirmedIdentity: {
            studentNumber: "B",
            name: "B",
            enrollmentYear: "2026",
            major: "m",
            className: "c",
          },
        },
        {
          participantId: "C",
          eligible: true,
          lotteryNumber: 1,
          confirmedIdentity: {
            studentNumber: "C",
            name: "C",
            enrollmentYear: "2026",
            major: "m",
            className: "c",
          },
        },
        {
          participantId: "D",
          eligible: true,
          lotteryNumber: 4,
          confirmedIdentity: {
            studentNumber: "D",
            name: "D",
            enrollmentYear: "2026",
            major: "m",
            className: "c",
          },
        },
      ],
      [
        { participantId: "A", version: 1, submittedAt: "2026-01-01T00:00:00.000Z", topicIds: [JIA] },
        { participantId: "B", version: 1, submittedAt: "2026-01-01T00:00:00.000Z", topicIds: [YI, JIA] },
        { participantId: "C", version: 1, submittedAt: "2026-01-01T00:00:00.000Z", topicIds: [YI] },
      ],
    );

    const batch = runAllocation(contract);
    const byId = new Map(batch.results.map((r) => [r.participantId, r]));
    const b = byId.get("B")!;
    expect(b.status).toBe("UNALLOCATED");

    const rounds = buildPersonalRounds(contract, "B", b);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]).toMatchObject({ rank: 1, topicId: YI, outcome: "OUTRANKED" });
    expect(rounds[1]).toMatchObject({
      rank: 2,
      topicId: JIA,
      outcome: "CAPACITY_FULL",
      availableAtRoundStart: 0,
    });
    expect(rounds.some((r) => r.outcome === "ASSIGNED")).toBe(false);
  });

  it("P1 regression: cross-topic capacity at same rank (luozichao report)", () => {
    const contract = minimalContract(
      [
        {
          participantId: "A",
          eligible: true,
          lotteryNumber: 1,
          confirmedIdentity: {
            studentNumber: "A",
            name: "A",
            enrollmentYear: "2026",
            major: "m",
            className: "c",
          },
        },
        {
          participantId: "B",
          eligible: true,
          lotteryNumber: 3,
          confirmedIdentity: {
            studentNumber: "B",
            name: "B",
            enrollmentYear: "2026",
            major: "m",
            className: "c",
          },
        },
        {
          participantId: "C",
          eligible: true,
          lotteryNumber: 2,
          confirmedIdentity: {
            studentNumber: "C",
            name: "C",
            enrollmentYear: "2026",
            major: "m",
            className: "c",
          },
        },
      ],
      [
        { participantId: "A", version: 1, submittedAt: "2026-01-01T00:00:00.000Z", topicIds: [YI] },
        { participantId: "B", version: 1, submittedAt: "2026-01-01T00:00:00.000Z", topicIds: [JIA, YI] },
        { participantId: "C", version: 1, submittedAt: "2026-01-01T00:00:00.000Z", topicIds: [JIA] },
      ],
    );

    const batch = runAllocation(contract);
    const a = batch.results.find((r) => r.participantId === "A")!;
    const b = batch.results.find((r) => r.participantId === "B")!;
    expect(a).toMatchObject({ status: "ASSIGNED", topicId: YI, matchedRank: 1 });
    expect(b.status).toBe("UNALLOCATED");

    const rounds = buildPersonalRounds(contract, "B", b);
    expect(rounds[0]).toMatchObject({ rank: 1, topicId: JIA, outcome: "OUTRANKED" });
    expect(rounds[1]).toMatchObject({
      rank: 2,
      topicId: YI,
      outcome: "CAPACITY_FULL",
      availableAtRoundStart: 0,
    });
  });

  it("marks ASSIGNED only on matched rank from authoritative result", () => {
    const contract = minimalContract(
      [
        {
          participantId: "D",
          eligible: true,
          lotteryNumber: 3,
          confirmedIdentity: {
            studentNumber: "D",
            name: "D",
            enrollmentYear: "2026",
            major: "m",
            className: "c",
          },
        },
      ],
      [
        {
          participantId: "D",
          version: 1,
          submittedAt: "2026-01-01T00:00:00.000Z",
          topicIds: [JIA, YI],
        },
      ],
    );
    const engine = toEngineInput(contract);
    const batch = runAllocation(contract);
    const d = batch.results[0];
    expect(d.status).toBe("ASSIGNED");

    const rounds = buildPersonalRounds(contract, "D", d);
    const assignedRounds = rounds.filter((r) => r.outcome === "ASSIGNED");
    expect(assignedRounds).toHaveLength(1);
    expect(assignedRounds[0].rank).toBe(d.matchedRank);
    expect(engine.participants[0].orderedTopicIds[d.matchedRank! - 1]).toBe(d.topicId);
  });
});
