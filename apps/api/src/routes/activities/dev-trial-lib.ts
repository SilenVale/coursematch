export type SimulateStrategy = "same_first" | "round_robin" | "random";

export function pickTopicId(
  strategy: SimulateStrategy,
  topicIds: string[],
  participantIndex: number,
  studentNumber: string,
): string | null {
  if (topicIds.length === 0) return null;
  if (strategy === "same_first") return topicIds[0] ?? null;
  if (strategy === "round_robin") {
    return topicIds[participantIndex % topicIds.length] ?? null;
  }
  let hash = 0;
  for (let i = 0; i < studentNumber.length; i += 1) {
    hash = (hash + studentNumber.charCodeAt(i)) % 2147483647;
  }
  return topicIds[hash % topicIds.length] ?? null;
}
