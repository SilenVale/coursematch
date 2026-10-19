import type {
  CalculatedBatch,
  FrozenInput,
  ParticipantAllocation,
} from "./types.js";

/**
 * 纯函数主分配。无 I/O、无随机、无当前时钟。
 * 规则见 docs/ALLOCATION.md
 */
export function calculateAllocation(input: FrozenInput): CalculatedBatch {
  const remaining = new Map(input.topics.map((t) => [t.topicId, t.capacity]));
  const assigned = new Set<string>();
  const hit = new Map<string, { topicId: string; matchedRank: number }>();

  for (let rank = 1; rank <= input.maxPreferences; rank += 1) {
    const byTopic = new Map<string, FrozenInput["participants"]>();
    for (const p of input.participants) {
      if (assigned.has(p.participantId)) continue;
      const topicId = p.orderedTopicIds[rank - 1];
      if (!topicId) continue;
      const list = byTopic.get(topicId) ?? [];
      list.push(p);
      byTopic.set(topicId, list);
    }

    for (const [topicId, group] of byTopic) {
      const available = remaining.get(topicId) ?? 0;
      const eligible = group
        .filter((p) => p.eligibleTopicIds.includes(topicId))
        .sort((a, b) => a.lotteryNumber - b.lotteryNumber);
      const selected = eligible.slice(0, available);
      for (const p of selected) {
        assigned.add(p.participantId);
        hit.set(p.participantId, { topicId, matchedRank: rank });
      }
      remaining.set(topicId, available - selected.length);
    }
  }

  const results: ParticipantAllocation[] = input.participants.map((p) => {
    const h = hit.get(p.participantId);
    if (h) {
      return {
        participantId: p.participantId,
        status: "ASSIGNED",
        topicId: h.topicId,
        matchedRank: h.matchedRank,
        lotteryNumber: p.lotteryNumber,
      };
    }
    if (p.orderedTopicIds.length === 0) {
      return {
        participantId: p.participantId,
        status: "NOT_SUBMITTED",
        topicId: null,
        matchedRank: null,
        lotteryNumber: p.lotteryNumber,
      };
    }
    return {
      participantId: p.participantId,
      status: "UNALLOCATED",
      topicId: null,
      matchedRank: null,
      lotteryNumber: p.lotteryNumber,
    };
  });

  const topicStats = input.topics.map((t) => {
    const cap = t.capacity;
    const rem = remaining.get(t.topicId) ?? 0;
    return {
      topicId: t.topicId,
      capacity: cap,
      assignedCount: cap - rem,
      remainingSlots: rem,
    };
  });

  return { results, topicStats };
}
