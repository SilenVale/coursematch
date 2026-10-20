/**
 * 石俊贤 · M2 题目面板：列表 + 新建 + 编辑 + 删除 + 资格限定。
 *
 * 依赖 `topic` / `topic_eligible_participant` 两张表。表未落地时接口返回 501，
 * 面板展示「待接入」而不是把错误当成空列表。
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

interface TopicForm {
  title: string;
  description: string;
  tags: string;
  capacity: string;
  eligibilityDescription: string;
  eligibilityMode: "ALL" | "EXPLICIT";
  eligibleParticipantIds: string[];
}

const EMPTY_FORM: TopicForm = {
  title: "",
  description: "",
  tags: "",
  capacity: "1",
  eligibilityDescription: "",
  eligibilityMode: "ALL",
  eligibleParticipantIds: [],
};

function toForm(topic: TeacherTopicView): TopicForm {
  return {
    title: topic.title,
    description: topic.description,
    tags: topic.tags.join(", "),
    capacity: String(topic.capacity),
    eligibilityDescription: topic.eligibilityDescription,
    eligibilityMode: topic.eligibilityMode,
    eligibleParticipantIds: topic.eligibleParticipantIds ?? [],
  };
}

function parseTags(text: string): string[] {
  return text
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter((t) => t !== "");
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
  /** 题目增删后通知页面刷新「发布前检查」的题目数。 */
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
      // 发布前检查依赖题目数，列表一变化就上报。
      onTopicsChanged?.(res.items.length);
      // 限定资格需要选人，名单只在需要时加载一次。
      if (participants.length === 0) {
        try {
          const p = await listParticipants(activityId);
          setParticipants(p.items);
        } catch {
          /* 名单读不到时只影响 EXPLICIT 选择，不阻断题目列表 */
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
    const fields: TopicFields = {
      title: form.title,
      description: form.description,
      tags: parseTags(form.tags),
      capacity: Number(form.capacity),
      eligibilityDescription: form.eligibilityDescription,
    };

    // 契约用联合类型区分两种资格模式：ALL 的名单必须为空数组，
    // EXPLICIT 必须给出非空名单。这里按模式分别构造，避免类型断言。
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
    if (!window.confirm(`删除题目「${topic.title}」？此操作不可撤销。`)) return;
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
        <h2>题目与名额</h2>
        <span className="cm-muted">
          {loading
            ? "加载中…"
            : pending
              ? "待接入"
              : `${topics.length} 个题目，合计容量 ${totalCapacity}`}
        </span>
      </header>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {pending ? (
        <div className="cm-pending">
          <p>
            <strong>题目接口尚未实现（HTTP 501）。</strong>
          </p>
          <p>
            <code>GET/POST/PATCH/DELETE /api/activities/:activityId/topics</code> 依赖
            <code> topic </code>表，该表还没有进入数据库迁移。迁移补齐后本面板会自动接上。
          </p>
          <p className="cm-muted">在题目可配置之前，活动不满足发布条件。</p>
        </div>
      ) : topics.length === 0 ? (
        <p className="cm-empty">
          还没有题目。每个题目需要名称、简介、标签、容量和资格条件；名额必须是正整数。
        </p>
      ) : (
        <div className="cm-table-wrap">
          <table>
            <thead>
              <tr>
                <th>题目</th>
                <th>标签</th>
                <th>容量</th>
                <th>资格</th>
                <th>热度</th>
                {editable && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.topicId}>
                  <td>
                    <strong>{t.title}</strong>
                    {t.description && (
                      <div className="cm-muted cm-topic-desc">{t.description}</div>
                    )}
                  </td>
                  <td>
                    {t.tags.length === 0 ? (
                      <span className="cm-muted">—</span>
                    ) : (
                      t.tags.map((tag) => (
                        <span key={tag} className="cm-tag">
                          {tag}
                        </span>
                      ))
                    )}
                  </td>
                  <td>{t.capacity}</td>
                  <td>
                    <Badge tone={t.eligibilityMode === "ALL" ? "muted" : "warn"}>
                      {t.eligibilityMode === "ALL"
                        ? "名单内全体"
                        : `限定 ${t.eligibleParticipantIds?.length ?? 0} 人`}
                    </Badge>
                    {t.eligibilityDescription && (
                      <div className="cm-muted cm-topic-desc">{t.eligibilityDescription}</div>
                    )}
                  </td>
                  <td>
                    {t.heat.preferenceCount}
                    <span className="cm-muted"> 人选择</span>
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
              ))}
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
            新增题目
          </button>
          {!editable && <span className="cm-muted">活动已发布，题目不可修改</span>}
        </div>
      )}

      {formOpen && (
        <div className="cm-topic-form">
          <h3>{editingId ? "编辑题目" : "新增题目"}</h3>
          <div className="cm-grid">
            <label className="cm-field cm-span-2">
              <span>题目名称</span>
              <input
                value={form.title}
                maxLength={200}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <FieldErrorText errors={errorsFor("title")} />
            </label>

            <label className="cm-field cm-span-2">
              <span>题目简介</span>
              <textarea
                rows={2}
                maxLength={2000}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <FieldErrorText errors={errorsFor("description")} />
            </label>

            <label className="cm-field">
              <span>标签（逗号分隔，最多 8 个）</span>
              <input
                value={form.tags}
                placeholder="前端, React"
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
              <FieldErrorText errors={errorsFor("tags")} />
            </label>

            <label className="cm-field">
              <span>名额（正整数）</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
              <FieldErrorText errors={errorsFor("capacity")} />
            </label>

            <label className="cm-field">
              <span>资格模式</span>
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

            <label className="cm-field">
              <span>资格说明（给学生看）</span>
              <input
                value={form.eligibilityDescription}
                maxLength={500}
                placeholder="例如：需先修完数据结构"
                onChange={(e) =>
                  setForm({ ...form, eligibilityDescription: e.target.value })
                }
              />
              <FieldErrorText errors={errorsFor("eligibilityDescription")} />
            </label>

            {form.eligibilityMode === "EXPLICIT" && (
              <div className="cm-field cm-span-2">
                <span>限定学生（至少 1 人）</span>
                {participants.length === 0 ? (
                  <p className="cm-muted">本活动名单为空，请先导入名单再设置限定资格。</p>
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

          <div className="cm-actions">
            <button type="button" onClick={handleSubmit} disabled={busy}>
              {busy ? "保存中…" : editingId ? "保存修改" : "创建题目"}
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
