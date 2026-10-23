/**
 * 教师端 · 开设课程（底层仍为 topic：学生填报志愿的可选条目）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ParticipantView,
  TeacherTopicView,
  TopicFields,
} from "@coursematch/shared";
import {
  ApiError,
  createTopic,
  deleteTopic,
  listParticipants,
  listTopics,
  patchTopic,
} from "./configApi";
import { Badge, ErrorBanner, FieldErrorText, toApiError } from "./configUi";
import {
  buildOfferTitle,
  offerSummaryLine,
  packOfferDescription,
  unpackOfferDescription,
  type OfferFields,
} from "./topicOfferFormat";

interface TopicForm {
  instructor: string;
  courseName: string;
  schedule: string;
  room: string;
  courseNote: string;
  tags: string;
  capacity: string;
  eligibilityDescription: string;
  eligibilityMode: "ALL" | "EXPLICIT";
  eligibleParticipantIds: string[];
  showAdvanced: boolean;
}

const EMPTY_FORM: TopicForm = {
  instructor: "",
  courseName: "",
  schedule: "",
  room: "",
  courseNote: "",
  tags: "",
  capacity: "30",
  eligibilityDescription: "",
  eligibilityMode: "ALL",
  eligibleParticipantIds: [],
  showAdvanced: false,
};

function courseNameFromTitle(title: string, instructor: string): string {
  const sep = " · ";
  if (instructor && title.startsWith(`${instructor}${sep}`)) {
    return title.slice(instructor.length + sep.length);
  }
  return title;
}

function toForm(topic: TeacherTopicView): TopicForm {
  const offer = unpackOfferDescription(topic.description);
  const instructor = offer.instructor;
  return {
    instructor,
    courseName: courseNameFromTitle(topic.title, instructor),
    schedule: offer.schedule,
    room: offer.room,
    courseNote: offer.courseNote,
    tags: topic.tags.join(", "),
    capacity: String(topic.capacity),
    eligibilityDescription: topic.eligibilityDescription,
    eligibilityMode: topic.eligibilityMode,
    eligibleParticipantIds: topic.eligibleParticipantIds ?? [],
    showAdvanced: topic.tags.length > 0 || topic.eligibilityMode === "EXPLICIT",
  };
}

function parseTags(text: string): string[] {
  return text
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter((t) => t !== "");
}

function formToTopicFields(form: TopicForm): TopicFields {
  const offer: OfferFields = {
    instructor: form.instructor,
    schedule: form.schedule,
    room: form.room,
    courseNote: form.courseNote,
  };
  return {
    title: buildOfferTitle(form.instructor, form.courseName),
    description: packOfferDescription(offer),
    tags: parseTags(form.tags),
    capacity: Number(form.capacity),
    eligibilityDescription: form.eligibilityDescription,
  };
}

export function TopicPanel({
  activityId,
  configVersion,
  editable,
  onVersionChange,
  onTopicsChanged,
}: {
  activityId: string;
  configVersion: number;
  editable: boolean;
  onVersionChange: (configVersion: number) => void;
  onTopicsChanged?: (count: number) => void;
}) {
  const [topics, setTopics] = useState<TeacherTopicView[]>([]);
  const [participants, setParticipants] = useState<ParticipantView[]>([]);
  const [heatSource, setHeatSource] = useState<"LIVE" | "FROZEN">("LIVE");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<TopicForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPending(false);
    try {
      const res = await listTopics(activityId);
      setTopics(res.items as TeacherTopicView[]);
      setHeatSource(res.heatSource);
      onTopicsChanged?.(res.items.length);
      if (participants.length === 0) {
        try {
          const p = await listParticipants(activityId);
          setParticipants(p.items);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.notImplemented) {
        setPending(true);
        setTopics([]);
      } else {
        setError(apiError);
      }
    } finally {
      setLoading(false);
    }
  }, [activityId, participants.length, onTopicsChanged]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalCapacity = useMemo(
    () => topics.reduce((sum, t) => sum + t.capacity, 0),
    [topics],
  );

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setCreating(true);
    setError(null);
  }

  function startEdit(topic: TeacherTopicView) {
    setForm(toForm(topic));
    setEditingId(topic.topicId);
    setCreating(false);
    setError(null);
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
    setError(null);
  }

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    const fields = formToTopicFields(form);
    const isAll = form.eligibilityMode === "ALL";

    try {
      if (editingId) {
        const res = isAll
          ? await patchTopic(activityId, editingId, {
              ...fields,
              eligibilityMode: "ALL",
              eligibleParticipantIds: [],
              expectedConfigVersion: configVersion,
            })
          : await patchTopic(activityId, editingId, {
              ...fields,
              eligibilityMode: "EXPLICIT",
              eligibleParticipantIds: form.eligibleParticipantIds,
              expectedConfigVersion: configVersion,
            });
        onVersionChange(res.configVersion);
      } else {
        const res = isAll
          ? await createTopic(activityId, {
              ...fields,
              eligibilityMode: "ALL",
              eligibleParticipantIds: [],
              expectedConfigVersion: configVersion,
            })
          : await createTopic(activityId, {
              ...fields,
              eligibilityMode: "EXPLICIT",
              eligibleParticipantIds: form.eligibleParticipantIds,
              expectedConfigVersion: configVersion,
            });
        onVersionChange(res.configVersion);
      }
      cancel();
      await load();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(topic: TeacherTopicView) {
    if (!window.confirm(`删除「${topic.title}」？此操作不可撤销。`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await deleteTopic(activityId, topic.topicId, configVersion);
      onVersionChange(res.configVersion);
      await load();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const errorsFor = (field: string) =>
    (error?.fieldErrors ?? []).filter((e) => e.field === field);

  const formOpen = creating || editingId !== null;

  return (
    <section className="cm-panel">
      <header className="cm-panel-head">
        <h2>开设课程</h2>
        <span className="cm-muted">
          {loading
            ? "加载中…"
            : pending
              ? "待接入"
              : `${topics.length} 门可选课，合计名额 ${totalCapacity}`}
        </span>
      </header>

      <p className="cm-muted" style={{ marginTop: 0 }}>
        学生填报志愿时选择的是这里的每一门课（授课教师、时间、名额）。与上方的「选课任务基本信息」不同：基本信息定整场规则，这里定具体可选课。
      </p>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {pending ? (
        <div className="cm-pending">
          <p>
            <strong>开设课程接口尚未实现（HTTP 501）。</strong>
          </p>
        </div>
      ) : topics.length === 0 ? (
        <p className="cm-empty">
          还没有可选课程。请添加至少一门（授课教师、上课时间、招生名额为必填项）。
        </p>
      ) : (
        <div className="cm-table-wrap">
          <table>
            <thead>
              <tr>
                <th>课程</th>
                <th>时间 / 地点</th>
                <th>名额</th>
                <th>可选范围</th>
                <th>热度</th>
                {editable && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => {
                const offer = unpackOfferDescription(t.description);
                return (
                  <tr key={t.topicId}>
                    <td>
                      <strong>{t.title}</strong>
                      {offer.courseNote && (
                        <div className="cm-muted cm-topic-desc">{offer.courseNote}</div>
                      )}
                    </td>
                    <td className="cm-muted">
                      {offerSummaryLine(offer, "") || "—"}
                    </td>
                    <td>{t.capacity}</td>
                    <td>
                      <Badge tone={t.eligibilityMode === "ALL" ? "muted" : "warn"}>
                        {t.eligibilityMode === "ALL"
                          ? "名单内全体"
                          : `限定 ${t.eligibleParticipantIds?.length ?? 0} 人`}
                      </Badge>
                    </td>
                    <td>
                      {t.heat.preferenceCount}
                      <span className="cm-muted"> 人填报</span>
                    </td>
                    {editable && (
                      <td>
                        <div className="cm-row-actions">
                          <button type="button" onClick={() => startEdit(t)} disabled={busy}>
                            编辑
                          </button>
                          <button type="button" onClick={() => void handleDelete(t)} disabled={busy}>
                            删除
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!pending && !formOpen && (
        <div className="cm-actions">
          <button type="button" onClick={() => void load()} disabled={loading}>
            刷新
          </button>
          <button type="button" onClick={startCreate} disabled={!editable || busy}>
            添加教师课程
          </button>
          {!editable && <span className="cm-muted">已发布，不可再改开设课程</span>}
        </div>
      )}

      {formOpen && (
        <div className="cm-topic-form">
          <h3>{editingId ? "编辑开设课程" : "添加开设课程"}</h3>
          <div className="cm-grid">
            <label className="cm-field">
              <span>授课教师</span>
              <input
                value={form.instructor}
                maxLength={80}
                placeholder="例如：张老师"
                onChange={(e) => setForm({ ...form, instructor: e.target.value })}
              />
            </label>

            <label className="cm-field">
              <span>课程名称</span>
              <input
                value={form.courseName}
                maxLength={200}
                placeholder="例如：软件工程实践"
                onChange={(e) => setForm({ ...form, courseName: e.target.value })}
              />
              <FieldErrorText errors={errorsFor("title")} />
            </label>

            <label className="cm-field">
              <span>上课时间</span>
              <input
                value={form.schedule}
                maxLength={200}
                placeholder="例如：周二 3-4 节"
                onChange={(e) => setForm({ ...form, schedule: e.target.value })}
              />
            </label>

            <label className="cm-field">
              <span>上课地点</span>
              <input
                value={form.room}
                maxLength={200}
                placeholder="例如：教三 301（可选）"
                onChange={(e) => setForm({ ...form, room: e.target.value })}
              />
            </label>

            <label className="cm-field">
              <span>招生名额</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
              <FieldErrorText errors={errorsFor("capacity")} />
            </label>

            <label className="cm-field cm-span-2">
              <span>课程说明（可选，给学生看）</span>
              <textarea
                rows={2}
                maxLength={2000}
                value={form.courseNote}
                placeholder="选课要求、备注等"
                onChange={(e) => setForm({ ...form, courseNote: e.target.value })}
              />
              <FieldErrorText errors={errorsFor("description")} />
            </label>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginBottom: 12 }}
            onClick={() => setForm({ ...form, showAdvanced: !form.showAdvanced })}
          >
            {form.showAdvanced ? "收起高级设置" : "高级设置（标签、限定人选）"}
          </button>

          {form.showAdvanced && (
            <div className="cm-grid">
              <label className="cm-field">
                <span>标签（逗号分隔，最多 8 个）</span>
                <input
                  value={form.tags}
                  placeholder="可选"
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                />
                <FieldErrorText errors={errorsFor("tags")} />
              </label>

              <label className="cm-field">
                <span>可选范围</span>
                <select
                  value={form.eligibilityMode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      eligibilityMode: e.target.value as "ALL" | "EXPLICIT",
                      eligibleParticipantIds:
                        e.target.value === "ALL" ? [] : form.eligibleParticipantIds,
                    })
                  }
                >
                  <option value="ALL">名单内全体学生</option>
                  <option value="EXPLICIT">仅限指定学生</option>
                </select>
              </label>

              <label className="cm-field cm-span-2">
                <span>资格说明（可选）</span>
                <input
                  value={form.eligibilityDescription}
                  maxLength={500}
                  placeholder="例如：需先修完数据结构"
                  onChange={(e) =>
                    setForm({ ...form, eligibilityDescription: e.target.value })
                  }
                />
              </label>

              {form.eligibilityMode === "EXPLICIT" && (
                <div className="cm-field cm-span-2">
                  <span>限定学生</span>
                  {participants.length === 0 ? (
                    <p className="cm-muted">请先导入名单。</p>
                  ) : (
                    <div className="cm-participant-picker">
                      {participants.map((p) => {
                        const checked = form.eligibleParticipantIds.includes(p.participantId);
                        return (
                          <label key={p.participantId} className="cm-check-item">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...form.eligibleParticipantIds, p.participantId]
                                  : form.eligibleParticipantIds.filter(
                                      (id) => id !== p.participantId,
                                    );
                                setForm({ ...form, eligibleParticipantIds: next });
                              }}
                            />
                            <span>
                              {p.studentNumber} {p.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <FieldErrorText errors={errorsFor("eligibleParticipantIds")} />
                </div>
              )}
            </div>
          )}

          <div className="cm-actions">
            <button type="button" onClick={handleSubmit} disabled={busy}>
              {busy ? "保存中…" : editingId ? "保存修改" : "添加"}
            </button>
            <button type="button" onClick={cancel} disabled={busy}>
              取消
            </button>
          </div>
        </div>
      )}

      {heatSource === "FROZEN" && (
        <p className="cm-muted">热度取自冻结快照，不再实时变化。</p>
      )}
    </section>
  );
}
