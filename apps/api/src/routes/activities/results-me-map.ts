import type { PersonalResultView, ResultFields } from "@coursematch/shared";

export interface AllocationResultRow {
  status: string;
  topic_id: string | null;
  matched_rank: number | null;
  lottery_number: number;
  rounds: ResultFields["rounds"];
}

/** 将 allocation_result 单行映射为契约中的 ResultFields（不含 preparation）。 */
export function mapAllocationRowToResultFields(row: AllocationResultRow): ResultFields {
  const base = {
    lotteryNumber: row.lottery_number,
    rounds: row.rounds ?? [],
  };
  if (row.status === "ASSIGNED" && row.topic_id && row.matched_rank) {
    return {
      ...base,
      status: "ASSIGNED",
      topicId: row.topic_id,
      matchedRank: row.matched_rank,
    };
  }
  return {
    ...base,
    status: row.status === "NOT_SUBMITTED" ? "NOT_SUBMITTED" : "UNALLOCATED",
    topicId: null,
    matchedRank: null,
  };
}

export function buildPersonalResultView(
  publishedAt: string,
  row: AllocationResultRow,
): PersonalResultView {
  return {
    preparation: "READY",
    publishedAt,
    ...mapAllocationRowToResultFields(row),
  };
}
