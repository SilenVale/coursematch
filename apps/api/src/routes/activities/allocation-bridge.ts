import type { FrozenInput, PersonalRound, RoundOutcome } from "@coursematch/shared";
import {
  calculateAllocation,
  type FrozenInput as EngineInput,
  type ParticipantAllocation,
} from "@coursematch/allocation";

function canChooseTopic(topic: FrozenInput["topics"][number], participantId: string): boolean {
  if (topic.eligibilityMode === "ALL") return true;
  return topic.eligibleParticipantIds.includes(participantId);
}

type EngineParticipant = EngineInput["participants"][number];

function buildByTopicAtRank(
  participants: EngineParticipant[],
  assigned: Set<string>,
  rank: number,
): Map<string, EngineParticipant[]> {
  const byTopic = new Map<string, EngineParticipant[]>();
  for (const cand of participants) {
    if (assigned.has(cand.participantId)) continue;
    const tid = cand.orderedTopicIds[rank - 1];
    if (!tid) continue;
    const list = byTopic.get(tid) ?? [];
    list.push(cand);
    byTopic.set(tid, list);
  }
  return byTopic;
}

/** 与 `calculateAllocation` 单轮内对各题的处理顺序与扣减一致。 */
function processAllTopicsAtRank(
  byTopic: Map<string, EngineParticipant[]>,
  remaining: Map<string, number>,
  assigned: Set<string>,
): void {
  for (const [topicId, group] of byTopic) {
    const available = remaining.get(topicId) ?? 0;
    const eligible = group.filter((c) => c.eligibleTopicIds.includes(topicId));
    const sorted = [...eligible].sort((a, b) => a.lotteryNumber - b.lotteryNumber);
    const selected = sorted.slice(0, available);
    for (const s of selected) assigned.add(s.participantId);
    remaining.set(topicId, available - selected.length);
  }
}

export function toEngineInput(contract: FrozenInput): EngineInput {
  const submissionByParticipant = new Map(
    contract.submissions.map((s) => [s.participantId, s.topicIds]),
  );

  return {
    activityId: contract.activityId,
    maxPreferences: contract.maxPreferences,
    topics: contract.topics.map((t) => ({ topicId: t.topicId, capacity: t.capacity })),
    participants: contract.participants.map((p) => {
      const orderedTopicIds = submissionByParticipant.get(p.participantId) ?? [];
      const eligibleTopicIds = p.eligible
        ? contract.topics.filter((t) => canChooseTopic(t, p.participantId)).map((t) => t.topicId)
        : [];
      return {
        participantId: p.participantId,
        lotteryNumber: p.lotteryNumber,
        orderedTopicIds,
        eligibleTopicIds,
      };
    }),
  };
}

/** 为展示生成轮次说明（与主分配同一规则）。 */
export function buildPersonalRounds(
  contract: FrozenInput,
  participantId: string,
  allocation: ParticipantAllocation,
): PersonalRound[] {
  const engine = toEngineInput(contract);
  const p = engine.participants.find((x) => x.participantId === participantId);
  if (!p) return [];

  const remaining = new Map(engine.topics.map((t) => [t.topicId, t.capacity]));
  const assigned = new Set<string>();
  const rounds: PersonalRound[] = [];

  for (let rank = 1; rank <= contract.maxPreferences; rank += 1) {
    const topicId = p.orderedTopicIds[rank - 1];
    if (!topicId) continue;

    const byTopic = buildByTopicAtRank(engine.participants, assigned, rank);
    const availableAtRoundStart = remaining.get(topicId) ?? 0;
    const group = byTopic.get(topicId) ?? [];
    const eligible = group.filter((c) => c.eligibleTopicIds.includes(topicId));
    const eligibleCandidateCount = eligible.length;

    processAllTopicsAtRank(byTopic, remaining, assigned);
    const allocatedInRound = availableAtRoundStart - (remaining.get(topicId) ?? 0);

    let outcome: RoundOutcome;
    const eligibleSelf = p.eligibleTopicIds.includes(topicId);
    if (!eligibleSelf) {
      outcome = "NOT_ELIGIBLE";
    } else if (
      allocation.status === "ASSIGNED" &&
      allocation.topicId === topicId &&
      allocation.matchedRank === rank
    ) {
      outcome = "ASSIGNED";
    } else if (availableAtRoundStart === 0) {
      outcome = "CAPACITY_FULL";
    } else {
      outcome = "OUTRANKED";
    }

    rounds.push({
      rank,
      topicId,
      eligible: eligibleSelf,
      availableAtRoundStart,
      eligibleCandidateCount,
      allocatedInRound,
      outcome,
    });
  }

  return rounds;
}

export function runAllocation(contract: FrozenInput) {
  const engine = toEngineInput(contract);
  return calculateAllocation(engine);
}
