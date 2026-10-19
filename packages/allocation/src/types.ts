export type AllocationStatus = "ASSIGNED" | "UNALLOCATED" | "NOT_SUBMITTED";

export interface FrozenTopic {
  topicId: string;
  capacity: number;
}

export interface FrozenParticipant {
  participantId: string;
  lotteryNumber: number;
  /** 有序志愿；未提交为空数组 */
  orderedTopicIds: string[];
  /** 该参与者可填报的题目 id */
  eligibleTopicIds: string[];
}

export interface FrozenInput {
  activityId: string;
  maxPreferences: number;
  topics: FrozenTopic[];
  participants: FrozenParticipant[];
}

export interface ParticipantAllocation {
  participantId: string;
  status: AllocationStatus;
  topicId: string | null;
  matchedRank: number | null;
  lotteryNumber: number;
}

export interface CalculatedBatch {
  results: ParticipantAllocation[];
  topicStats: { topicId: string; capacity: number; assignedCount: number; remainingSlots: number }[];
}
