/**
 * 石俊贤 · M2 教师端「活动配置」页面。
 *
 * 覆盖 V1 主链中教师的第一段：创建草稿 → 编辑基本信息 → 导入/预览/替换名单
 * → 配置题目（待第二批）→ 发布，以及已发布活动的作废。
 *
 * 页面只做展示与请求编排：能不能改、能不能发布由服务端判定，
 * 按钮禁用只是提示（ARCHITECTURE「页面上的按钮状态只是提示，授权以服务端为准」）。
 */
import { useCallback, useEffect, useState } from "react";
import type { ActivitySummary, ActivityView } from "@coursematch/shared";
import { ActivityBasicsForm } from "./ActivityBasicsForm";
import { PublishPanel } from "./PublishPanel";
import { RosterPanel } from "./RosterPanel";
import { TopicPanel } from "./TopicPanel";
import {
  ApiError,
  createActivity,
  getActivity,
  listActivities,
  listParticipants,
  listTopics,
} from "./configApi";
import {
  Badge,
  ErrorBanner,
  FieldErrorText,
  LIFECYCLE_LABEL,
  PHASE_LABEL,
  formatBeijing,
  fromDateTimeLocal,
  toApiError,
} from "./configUi";
import "./teacher-config.css";

/** 新建草稿的默认值：一周后截止，避免教师每次都从头填时间。 */
function defaultDraft() {
  const start = new Date();
  const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
      d.getMinutes(),
    )}`;
  return {
    title: "",
    description: "",
    startAt: local(start),
    deadlineAt: local(deadline),
    maxPreferences: "3",
  };
}

function CreateActivityForm({
  onCreated,
  onCancel,
}: {
  onCreated: (activity: ActivityView) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(defaultDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const created = await createActivity({
        title: form.title,
        description: form.description,
        startAt: fromDateTimeLocal(form.startAt),
        deadlineAt: fromDateTimeLocal(form.deadlineAt),
        maxPreferences: Number(form.maxPreferences),
      });
      onCreated(created);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const errorsFor = (field: string) =>
    (error?.fieldErrors ?? []).filter((e) => e.field === field);

  return (
    <div className="cm-create">
      <h2>新建活动草稿</h2>
      <p className="cm-muted">
        草稿阶段可以自由修改。发布后，标题、时间、志愿数和名单都会锁定。
      </p>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="cm-grid">
        <label className="cm-field cm-span-2">
          <span>活动名称</span>
          <input
            value={form.title}
            maxLength={120}
            placeholder="例如：2026 春季《软件工程》选题"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <FieldErrorText errors={errorsFor("title")} />
        </label>

        <label className="cm-field cm-span-2">
          <span>活动说明</span>
          <textarea
            rows={3}
            value={form.description}
            maxLength={2000}
            placeholder="给学生看的说明：选题范围、注意事项等"
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <FieldErrorText errors={errorsFor("description")} />
        </label>

        <label className="cm-field">
          <span>开始时间</span>
          <input
            type="datetime-local"
            value={form.startAt}
            onChange={(e) => setForm({ ...form, startAt: e.target.value })}
          />
          <FieldErrorText errors={errorsFor("startAt")} />
        </label>

        <label className="cm-field">
          <span>截止时间</span>
          <input
            type="datetime-local"
            value={form.deadlineAt}
            onChange={(e) => setForm({ ...form, deadlineAt: e.target.value })}
          />
          <FieldErrorText errors={errorsFor("deadlineAt")} />
        </label>

        <label className="cm-field">
          <span>最大志愿数（1～3）</span>
          <select
            value={form.maxPreferences}
            onChange={(e) => setForm({ ...form, maxPreferences: e.target.value })}
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
          <FieldErrorText errors={errorsFor("maxPreferences")} />
        </label>
      </div>

      <div className="cm-actions">
        <button type="button" onClick={handleSubmit} disabled={busy}>
          {busy ? "创建中…" : "创建草稿"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
    </div>
  );
}

export function ActivityConfigPage() {
  const [items, setItems] = useState<ActivitySummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<ApiError | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityView | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<ApiError | null>(null);

  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const [topicCount, setTopicCount] = useState<number | null>(null);
  const [topicPending, setTopicPending] = useState(false);

  const [creating, setCreating] = useState(false);
  const [pageError, setPageError] = useState<ApiError | null>(null);

  const loadActivities = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await listActivities();
      setItems(res.items);
      return res.items;
    } catch (err) {
      setListError(toApiError(err));
      return [];
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  /** 发布前检查需要名单人数与题目数，这里单独取一次轻量数据。 */
  const loadCounts = useCallback(async (activityId: string) => {
    try {
      const participants = await listParticipants(activityId);
      setParticipantCount(participants.items.length);
    } catch {
      setParticipantCount(null);
    }
    try {
      const topics = await listTopics(activityId);
      setTopicCount(topics.items.length);
      setTopicPending(false);
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.notImplemented) {
        setTopicCount(null);
        setTopicPending(true);
      } else {
        setTopicCount(null);
      }
    }
  }, []);

  const selectActivity = useCallback(
    async (activityId: string) => {
      setSelectedId(activityId);
      setLoadingDetail(true);
      setDetailError(null);
      setParticipantCount(null);
      setTopicCount(null);
      setTopicPending(false);
      try {
        const detail = await getActivity(activityId);
        setActivity(detail);
        await loadCounts(activityId);
      } catch (err) {
        setDetailError(toApiError(err));
        setActivity(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [loadCounts],
  );

  // 首次进入时自动选中第一个活动，避免空页面。
  useEffect(() => {
    if (!selectedId && items.length > 0 && !creating) {
      void selectActivity(items[0].activityId);
    }
  }, [items, selectedId, creating, selectActivity]);

  function handleSaved(next: ActivityView) {
    setActivity(next);
    void loadActivities();
  }

  function handleVersionChange(configVersion: number) {
    setActivity((prev) => (prev ? { ...prev, configVersion } : prev));
  }

  async function handleCreated(created: ActivityView) {
    setCreating(false);
    await loadActivities();
    await selectActivity(created.activityId);
  }

  async function handleVoided() {
    if (selectedId) await selectActivity(selectedId);
    await loadActivities();
  }

  const canEditBasics = activity?.lifecycle === "DRAFT";
  const canEditDescription =
    activity?.lifecycle === "DRAFT" || activity?.lifecycle === "PUBLISHED";

  return (
    <div className="cm-config">
      <header className="cm-page-head">
        <div>
          <h1>教师 · 活动配置</h1>
          <p className="cm-muted">
            创建草稿、导入五列名单、配置题目与名额、发布或作废活动。
          </p>
        </div>
        <button type="button" onClick={() => setCreating(true)} disabled={creating}>
          新建活动
        </button>
      </header>

      <ErrorBanner error={pageError} onDismiss={() => setPageError(null)} />

      <div className="cm-layout">
        <aside className="cm-sidebar">
          <h2>我的活动</h2>
          {loadingList && <p className="cm-muted">加载中…</p>}
          <ErrorBanner error={listError} onDismiss={() => setListError(null)} />
          {!loadingList && items.length === 0 && (
            <p className="cm-empty">还没有活动。点「新建活动」创建第一个草稿。</p>
          )}
          <ul className="cm-activity-list">
            {items.map((item) => (
              <li key={item.activityId}>
                <button
                  type="button"
                  className={item.activityId === selectedId ? "cm-activity active" : "cm-activity"}
                  onClick={() => void selectActivity(item.activityId)}
                >
                  <span className="cm-activity-title">{item.title}</span>
                  <span className="cm-activity-meta">
                    <Badge tone={item.lifecycle === "DRAFT" ? "draft" : "published"}>
                      {LIFECYCLE_LABEL[item.lifecycle]}
                    </Badge>
                    {PHASE_LABEL[item.phase] !== LIFECYCLE_LABEL[item.lifecycle] && (
                      <span className="cm-muted">{PHASE_LABEL[item.phase]}</span>
                    )}
                  </span>
                  <span className="cm-activity-time">
                    截止 {formatBeijing(item.deadlineAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="cm-main">
          {creating && (
            <CreateActivityForm
              onCreated={(created) => void handleCreated(created)}
              onCancel={() => setCreating(false)}
            />
          )}

          {!creating && loadingDetail && <p className="cm-muted">加载活动…</p>}
          <ErrorBanner error={detailError} onDismiss={() => setDetailError(null)} />

          {!creating && !loadingDetail && !activity && !detailError && (
            <p className="cm-empty">从左侧选择一个活动，或新建一个草稿。</p>
          )}

          {!creating && activity && (
            <>
              <div className="cm-summary">
                <div>
                  <h2>{activity.title}</h2>
                  <p className="cm-muted">{activity.description || "（未填写活动说明）"}</p>
                </div>
                <div className="cm-summary-meta">
                  <Badge tone={activity.lifecycle === "DRAFT" ? "draft" : "published"}>
                    {LIFECYCLE_LABEL[activity.lifecycle]}
                  </Badge>
                  {/* lifecycle 与 phase 同名时（草稿/已作废/已关闭）不重复显示。 */}
                  {PHASE_LABEL[activity.phase] !== LIFECYCLE_LABEL[activity.lifecycle] && (
                    <span className="cm-muted">{PHASE_LABEL[activity.phase]}</span>
                  )}
                  <span className="cm-muted">规则 {activity.ruleVersion}</span>
                  <span className="cm-muted">配置 v{activity.configVersion}</span>
                </div>
              </div>

              <ActivityBasicsForm
                activity={activity}
                canEditTitle={canEditBasics}
                canEditDescription={canEditDescription}
                onSaved={handleSaved}
              />

              <RosterPanel
                activityId={activity.activityId}
                configVersion={activity.configVersion}
                editable={canEditBasics}
                onVersionChange={handleVersionChange}
                onChanged={() => void loadCounts(activity.activityId)}
              />

              <TopicPanel activityId={activity.activityId} editable={canEditBasics} />

              <PublishPanel
                activity={activity}
                participantCount={participantCount}
                topicCount={topicCount}
                topicPending={topicPending}
                onPublished={handleSaved}
                onVoided={() => void handleVoided()}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
