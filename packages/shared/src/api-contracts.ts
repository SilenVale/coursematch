export type Id = string;
export type IsoDateTime = string;
export type Lifecycle = "DRAFT" | "PUBLISHED" | "ALLOCATED" | "CLOSED" | "VOID";
export type ErrorCode = "INVALID_INPUT" | "IMPORT_INVALID" | "PAYLOAD_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE" | "INVALID_CREDENTIALS" | "UNAUTHENTICATED" | "NOT_ELIGIBLE" | "ROLE_FORBIDDEN" | "REQUEST_ORIGIN_FORBIDDEN" | "RESOURCE_NOT_FOUND" | "VERSION_CONFLICT" | "NOT_STARTED" | "DEADLINE_REACHED" | "CONFIG_LOCKED" | "ACTIVITY_VOID" | "ACTIVITY_CLOSED" | "FREEZE_REQUIRED" | "ALREADY_ALLOCATED" | "RATE_LIMITED" | "INTERNAL_ERROR" | "SERVICE_UNAVAILABLE";

export type ActivityPhase = "DRAFT" | "NOT_STARTED" | "FILLING" | "DEADLINE_REACHED" | "ALLOCATED" | "CLOSED" | "VOID";
export type FreezePreparation = "PENDING" | "FAILED" | "READY";
export type ResultPreparation = "PENDING" | "READY";
export type AllowedAction = "UPDATE_ACTIVITY" | "UPDATE_DESCRIPTION" | "REPLACE_ROSTER" | "CREATE_TOPIC" | "UPDATE_TOPIC" | "DELETE_TOPIC" | "PUBLISH_ACTIVITY" | "SAVE_PREFERENCES" | "FREEZE_ACTIVITY" | "ALLOCATE_ACTIVITY" | "VOID_ACTIVITY" | "CLOSE_ACTIVITY";
export interface FreezeFailure { operationId: Id; occurredAt: IsoDateTime; code: ErrorCode; message: string }
export type OperationActorKind = "TEACHER" | "STUDENT" | "SYSTEM";
export type OperationAction = "CREATE_ACTIVITY" | "UPDATE_ACTIVITY" | "REPLACE_ROSTER" | "CREATE_TOPIC" | "UPDATE_TOPIC" | "DELETE_TOPIC" | "PUBLISH_ACTIVITY" | "SAVE_PREFERENCES" | "FREEZE_ACTIVITY" | "ALLOCATE_ACTIVITY" | "VOID_ACTIVITY" | "CLOSE_ACTIVITY";
export type OperationOutcome = "SUCCEEDED" | "FAILED";
export type ConfigChangedField = "title" | "description" | "startAt" | "deadlineAt" | "maxPreferences" | "tags" | "capacity" | "eligibilityMode" | "eligibilityDescription" | "eligibleParticipantIds";
export interface OperationSafeDetails {
  configVersionBefore?: number;
  configVersionAfter?: number;
  submissionVersionBefore?: number;
  submissionVersionAfter?: number;
  participantCount?: number;
  topicCount?: number;
  counts?: { assigned: number; unallocated: number; notSubmitted: number };
  changedFields?: ConfigChangedField[];
  descriptionChange?: { before: string; after: string };
  retryCount?: number;
  nextRetryAt?: IsoDateTime;
  errorClass?: ErrorCode;
}


export type ActorView =
  | { accountId: Id; role: "TEACHER"; displayName: string; studentProfileId?: never; studentNumber?: never }
  | { accountId: Id; role: "STUDENT"; displayName: string; studentProfileId: Id; studentNumber: string };
export interface LoginInput { identifier: string; password: string }
export interface PasswordInput { currentPassword: string; newPassword: string }
export interface PasswordChangedView { passwordChanged: true; reloginRequired: true }
export interface LogoutView { loggedOut: true }
export interface ActivityDraftInput {
  title: string;
  description: string;
  startAt: IsoDateTime;
  deadlineAt: IsoDateTime;
  maxPreferences: number;
}
export type AtLeastOne<Fields> = {
  [Field in keyof Fields]-?: Required<Pick<Fields, Field>> & Partial<Omit<Fields, Field>>
}[keyof Fields];
export interface ConfigVersionInput { expectedConfigVersion: number }
export type ActivityPatchInput = AtLeastOne<ActivityDraftInput> & ConfigVersionInput;
export interface ActivitySummary {
  activityId: Id;
  title: string;
  lifecycle: Lifecycle;
  phase: ActivityPhase;
  startAt: IsoDateTime;
  deadlineAt: IsoDateTime;
}
export interface ActivityView extends ActivitySummary {
  description: string;
  maxPreferences: number;
  ruleVersion: string;
  configVersion: number;
  freezePreparation: FreezePreparation;
  resultPreparation: ResultPreparation;
  allowedActions: AllowedAction[];
}
export interface ConfirmedIdentity {
  studentNumber: string;
  name: string;
  enrollmentYear: string;
  major: string;
  className: string;
}
export interface ParticipantView extends ConfirmedIdentity {
  participantId: Id;
  eligible: boolean;
  accountConfigured: boolean;
}
export interface ParticipantQuery { q?: string; enrollmentYear?: string; major?: string; className?: string }
export interface RosterInput { file: Blob; expectedConfigVersion: number }
export interface RosterPreviewRow extends ConfirmedIdentity { rowNumber: number; change: "ADDED" | "RETAINED" }
export interface RosterPreview {
  configVersion: number;
  addedCount: number;
  removedCount: number;
  retainedCount: number;
  rows: RosterPreviewRow[];
}
export interface RosterReplacedView { participantCount: number; configVersion: number }
export interface TopicFields { title: string; description: string; tags: string[]; capacity: number; eligibilityDescription: string }
export type TopicInput = TopicFields & (
  | { eligibilityMode: "ALL"; eligibleParticipantIds?: [] }
  | { eligibilityMode: "EXPLICIT"; eligibleParticipantIds: Id[] }
);
export type TopicPatchInput = AtLeastOne<TopicFields & { eligibilityMode: "ALL" | "EXPLICIT"; eligibleParticipantIds: Id[] }> & ConfigVersionInput;
export type TopicCreateInput = TopicInput & ConfigVersionInput;
export interface TopicCommonView extends TopicFields {
  topicId: Id;
  eligibilityMode: "ALL" | "EXPLICIT";
  heat: { preferenceCount: number };
}
export interface TeacherTopicView extends TopicCommonView { eligibleParticipantIds: Id[]; canChoose?: never }
export interface StudentTopicView extends TopicCommonView { canChoose: boolean; eligibleParticipantIds?: never }
export type TopicView = TeacherTopicView | StudentTopicView;
export interface TopicQuery { q?: string; tag?: string }
export interface TopicListView { items: TopicView[]; heatAsOf: IsoDateTime; heatSource: "LIVE" | "FROZEN" }
export interface TopicWrittenView { topic: TeacherTopicView; configVersion: number }
export interface ConfigVersionView { configVersion: number }
export interface PreferenceWrite { topicIds: Id[]; expectedVersion: number }
export interface PreferenceView { topicIds: Id[]; version: number; submittedAt: IsoDateTime | null }
export interface TeacherPreferenceView extends PreferenceView { participantId: Id; submitted: boolean }
export type FreezeView =
  | { preparation: "PENDING"; snapshotId?: never; frozenAt?: never; lastFailure?: never }
  | { preparation: "FAILED"; lastFailure: FreezeFailure; snapshotId?: never; frozenAt?: never }
  | { preparation: "READY"; snapshotId: Id; frozenAt: IsoDateTime; lastFailure?: never };
export interface TopicAllocationSummary { topicId: Id; capacity: number; assignedCount: number; remainingSlots: number }
export interface AllocationView {
  batchId: Id;
  snapshotId: Id;
  executedAt: IsoDateTime;
  counts: { assigned: number; unallocated: number; notSubmitted: number };
  topics: TopicAllocationSummary[];
}
export type RoundOutcome = "ASSIGNED" | "NOT_ELIGIBLE" | "CAPACITY_FULL" | "OUTRANKED";
export interface PersonalRound {
  rank: number;
  topicId: Id;
  eligible: boolean;
  availableAtRoundStart: number;
  eligibleCandidateCount: number;
  allocatedInRound: number;
  outcome: RoundOutcome;
}
export type ResultFields = { lotteryNumber: number; rounds: PersonalRound[] } & (
  | { status: "ASSIGNED"; topicId: Id; matchedRank: number }
  | { status: "UNALLOCATED" | "NOT_SUBMITTED"; topicId: null; matchedRank: null }
);
export type PersonalResultView =
  | { preparation: "PENDING"; status?: never; topicId?: never; matchedRank?: never; lotteryNumber?: never; rounds?: never; publishedAt?: never }
  | ({ preparation: "READY"; publishedAt: IsoDateTime } & ResultFields);
export type TeacherResultView = { participantId: Id } & ResultFields;
export type TeacherResultsView = { preparation: "PENDING" } | ({ preparation: "READY"; items: TeacherResultView[] } & AllocationView);
export interface FrozenParticipant { participantId: Id; eligible: boolean; lotteryNumber: number; confirmedIdentity: ConfirmedIdentity }
export type FrozenTopic = { topicId: Id } & TopicFields & (
  | { eligibilityMode: "ALL"; eligibleParticipantIds: [] }
  | { eligibilityMode: "EXPLICIT"; eligibleParticipantIds: Id[] }
);
export interface FrozenSubmission { participantId: Id; version: number; submittedAt: IsoDateTime; topicIds: Id[] }
export interface FrozenInput {
  inputFormatVersion: 1;
  activityId: Id;
  configVersion: number;
  title: string;
  description: string;
  ruleVersion: "cm-rule-v1";
  maxPreferences: number;
  startAt: IsoDateTime;
  deadlineAt: IsoDateTime;
  participants: FrozenParticipant[];
  topics: FrozenTopic[];
  submissions: FrozenSubmission[];
}
export interface FrozenSnapshotEvidence { id: Id; activityId: Id; inputFormatVersion: 1; frozenAt: IsoDateTime; input: FrozenInput }
export interface BatchEvidence { id: Id; activityId: Id; snapshotId: Id; executedAt: IsoDateTime }
export type OperationEvidence = {
  id: Id;
  activityId: Id;
  action: OperationAction;
  occurredAt: IsoDateTime;
  outcome: OperationOutcome;
  reason?: string;
  snapshotId?: Id;
  batchId?: Id;
  safeDetails?: OperationSafeDetails;
} & (
  | { actorKind: "TEACHER" | "STUDENT"; actorAccountId: Id }
  | { actorKind: "SYSTEM"; actorAccountId?: never }
);
export interface EvidenceView {
  snapshot: FrozenSnapshotEvidence | null;
  batch: BatchEvidence | null;
  operations: OperationEvidence[];
}
export interface ReasonInput { reason: string }
export interface VoidView { lifecycle: "VOID"; voidAt: IsoDateTime; reason: string }
export interface CloseView { lifecycle: "CLOSED"; closedAt: IsoDateTime; reason: string }
export interface FieldError { field: string; code: string; message: string }
export interface RowError extends FieldError { rowNumber: number }
export interface ApiSuccess<Payload> { data: Payload; serverTime: IsoDateTime }
export interface BusinessApiFailure {
  error: { code: ErrorCode; message: string; fieldErrors?: FieldError[]; rowErrors?: RowError[] };
  serverTime: IsoDateTime;
}
export interface EdgeHttpFailure { status: 413 | 415; body?: unknown }
export interface ActivityPath { activityId: Id }
export interface TopicPath extends ActivityPath { topicId: Id }
export type EmptyInput = Record<string, never>;
export interface Endpoint<Path, Query, Body, Payload> {
  request: { path: Path; query: Query; body: Body };
  response: ApiSuccess<Payload>;
}
export interface ApiContracts {
  "POST /api/auth/login": Endpoint<EmptyInput, EmptyInput, LoginInput, ActorView>;
  "GET /api/auth/me": Endpoint<EmptyInput, EmptyInput, EmptyInput, ActorView>;
  "POST /api/auth/logout": Endpoint<EmptyInput, EmptyInput, EmptyInput, LogoutView>;
  "PUT /api/auth/password": Endpoint<EmptyInput, EmptyInput, PasswordInput, PasswordChangedView>;
  "GET /api/activities": Endpoint<EmptyInput, EmptyInput, EmptyInput, { items: ActivitySummary[] }>;
  "POST /api/activities": Endpoint<EmptyInput, EmptyInput, ActivityDraftInput, ActivityView>;
  "GET /api/activities/:activityId": Endpoint<ActivityPath, EmptyInput, EmptyInput, ActivityView>;
  "PATCH /api/activities/:activityId": Endpoint<ActivityPath, EmptyInput, ActivityPatchInput, ActivityView>;
  "GET /api/activities/:activityId/participants": Endpoint<ActivityPath, ParticipantQuery, EmptyInput, { items: ParticipantView[] }>;
  "POST /api/activities/:activityId/participants/preview": Endpoint<ActivityPath, EmptyInput, RosterInput, RosterPreview>;
  "PUT /api/activities/:activityId/participants": Endpoint<ActivityPath, EmptyInput, RosterInput, RosterReplacedView>;
  "GET /api/activities/:activityId/topics": Endpoint<ActivityPath, TopicQuery, EmptyInput, TopicListView>;
  "POST /api/activities/:activityId/topics": Endpoint<ActivityPath, EmptyInput, TopicCreateInput, TopicWrittenView>;
  "PATCH /api/activities/:activityId/topics/:topicId": Endpoint<TopicPath, EmptyInput, TopicPatchInput, TopicWrittenView>;
  "DELETE /api/activities/:activityId/topics/:topicId": Endpoint<TopicPath, EmptyInput, ConfigVersionInput, ConfigVersionView>;
  "POST /api/activities/:activityId/publish": Endpoint<ActivityPath, EmptyInput, ConfigVersionInput, ActivityView>;
  "GET /api/activities/:activityId/preferences/me": Endpoint<ActivityPath, EmptyInput, EmptyInput, PreferenceView>;
  "PUT /api/activities/:activityId/preferences/me": Endpoint<ActivityPath, EmptyInput, PreferenceWrite, PreferenceView>;
  "GET /api/activities/:activityId/preferences": Endpoint<ActivityPath, EmptyInput, EmptyInput, { items: TeacherPreferenceView[] }>;
  "GET /api/activities/:activityId/freeze": Endpoint<ActivityPath, EmptyInput, EmptyInput, FreezeView>;
  "POST /api/activities/:activityId/freeze": Endpoint<ActivityPath, EmptyInput, EmptyInput, FreezeView>;
  "POST /api/activities/:activityId/allocation": Endpoint<ActivityPath, EmptyInput, EmptyInput, AllocationView>;
  "GET /api/activities/:activityId/results/me": Endpoint<ActivityPath, EmptyInput, EmptyInput, PersonalResultView>;
  "GET /api/activities/:activityId/results": Endpoint<ActivityPath, EmptyInput, EmptyInput, TeacherResultsView>;
  "GET /api/activities/:activityId/evidence": Endpoint<ActivityPath, EmptyInput, EmptyInput, EvidenceView>;
  "POST /api/activities/:activityId/void": Endpoint<ActivityPath, EmptyInput, ReasonInput, VoidView>;
  "POST /api/activities/:activityId/close": Endpoint<ActivityPath, EmptyInput, ReasonInput, CloseView>;
}
