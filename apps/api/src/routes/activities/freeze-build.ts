import { randomInt, randomUUID } from "node:crypto";
import type {
  ConfirmedIdentity,
  FrozenInput,
  FrozenParticipant,
  FrozenSubmission,
  FrozenTopic,
  Lifecycle,
} from "@coursematch/shared";
import type { Pool, PoolClient } from "pg";
import { loadEligibleParticipantIds } from "./config-topics-db.js";
import type { TopicRow } from "./config-topics.js";

interface ActivityRow {
  id: string;
  title: string;
  description: string;
  start_at: Date;
  deadline_at: Date;
  max_preferences: number;
  config_version: number;
  rule_version: string;
  lifecycle: Lifecycle;
}

interface ParticipantRow {
  id: string;
  eligible: boolean;
  student_number: string;
  name: string;
  enrollment_year: string;
  major: string;
  class_name: string;
}

function identity(row: ParticipantRow): ConfirmedIdentity {
  return {
    studentNumber: row.student_number,
    name: row.name,
    enrollmentYear: row.enrollment_year,
    major: row.major,
    className: row.class_name,
  };
}

function shuffleLottery(participantIds: string[]): Map<string, number> {
  const ids = [...participantIds];
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const map = new Map<string, number>();
  ids.forEach((id, index) => map.set(id, index + 1));
  return map;
}

async function loadTopics(db: Pool | PoolClient, activityId: string): Promise<TopicRow[]> {
  const { rows } = await db.query<TopicRow>(
    `SELECT id, activity_id, title, description, tags, capacity,
            eligibility_mode, eligibility_description
     FROM topic WHERE activity_id = $1 ORDER BY created_at`,
    [activityId],
  );
  return rows;
}

export async function buildFrozenInput(
  db: Pool | PoolClient,
  activity: ActivityRow,
): Promise<FrozenInput> {
  const { rows: participants } = await db.query<ParticipantRow>(
    `SELECT p.id, p.eligible, sp.student_number, sp.name, sp.enrollment_year, sp.major, sp.class_name
     FROM participant p
     JOIN student_profile sp ON sp.id = p.student_profile_id
     WHERE p.activity_id = $1
     ORDER BY sp.student_number`,
    [activity.id],
  );

  const topicRows = await loadTopics(db, activity.id);
  const eligibleByTopic = await loadEligibleParticipantIds(topicRows.map((t) => t.id));
  const lottery = shuffleLottery(participants.map((p) => p.id));

  const frozenParticipants: FrozenParticipant[] = participants.map((p) => ({
    participantId: p.id,
    eligible: p.eligible,
    lotteryNumber: lottery.get(p.id) ?? 0,
    confirmedIdentity: identity(p),
  }));

  const topics: FrozenTopic[] = topicRows.map((t) => {
    if (t.eligibility_mode === "ALL") {
      return {
        topicId: t.id,
        title: t.title,
        description: t.description,
        tags: t.tags ?? [],
        capacity: t.capacity,
        eligibilityDescription: t.eligibility_description,
        eligibilityMode: "ALL",
        eligibleParticipantIds: [],
      };
    }
    return {
      topicId: t.id,
      title: t.title,
      description: t.description,
      tags: t.tags ?? [],
      capacity: t.capacity,
      eligibilityDescription: t.eligibility_description,
      eligibilityMode: "EXPLICIT",
      eligibleParticipantIds: eligibleByTopic.get(t.id) ?? [],
    };
  });

  const { rows: subs } = await db.query<{
    participant_id: string;
    topic_ids: string[];
    version: number;
    submitted_at: Date;
  }>(
    `SELECT participant_id, topic_ids, version, submitted_at
     FROM preference_submission WHERE activity_id = $1`,
    [activity.id],
  );

  const submissions: FrozenSubmission[] = subs.map((s) => ({
    participantId: s.participant_id,
    version: s.version,
    submittedAt: s.submitted_at.toISOString(),
    topicIds: s.topic_ids,
  }));

  return {
    inputFormatVersion: 1,
    activityId: activity.id,
    configVersion: activity.config_version,
    title: activity.title,
    description: activity.description,
    ruleVersion: "cm-rule-v1",
    maxPreferences: activity.max_preferences,
    startAt: activity.start_at.toISOString(),
    deadlineAt: activity.deadline_at.toISOString(),
    participants: frozenParticipants,
    topics,
    submissions,
  };
}

export async function insertOperationLog(
  db: Pool | PoolClient,
  row: {
    activityId: string;
    action: string;
    actorKind: "TEACHER" | "STUDENT" | "SYSTEM";
    actorAccountId?: string;
    outcome: "SUCCEEDED" | "FAILED";
    reason?: string;
    snapshotId?: string;
    batchId?: string;
    safeDetails?: Record<string, unknown>;
  },
) {
  await db.query(
    `INSERT INTO operation_log (
      id, activity_id, action, actor_kind, actor_account_id, outcome, reason, snapshot_id, batch_id, safe_details
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      randomUUID(),
      row.activityId,
      row.action,
      row.actorKind,
      row.actorAccountId ?? null,
      row.outcome,
      row.reason ?? null,
      row.snapshotId ?? null,
      row.batchId ?? null,
      row.safeDetails ? JSON.stringify(row.safeDetails) : null,
    ],
  );
}
