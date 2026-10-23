import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ActivitySummary,
  ActivityView,
  StudentTopicView,
  TopicListView,
} from "@coursematch/shared";
import {
  StudentApiError,
  fetchActivity,
  fetchMyPreferences,
  fetchStudentActivities,
  fetchTopics,
  saveMyPreferences,
} from "./student-api";

function isStudentTopic(topic: TopicListView["items"][number]): topic is StudentTopicView {
  return "canChoose" in topic;
}

export function PreferencesPage() {
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [activityId, setActivityId] = useState("");
  const [activity, setActivity] = useState<ActivityView | null>(null);
  const [topics, setTopics] = useState<TopicListView | null>(null);
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState<string[]>([]);
  const [draft, setDraft] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchStudentActivities()
      .then((items) => {
        setActivities(items);
        if (items.length > 0) setActivityId(items[0].activityId);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载活动失败"));
  }, []);

  const load = useCallback(async (id: string) => {
    setError("");
    setNotice("");
    try {
      const [detail, topicList, mine] = await Promise.all([
        fetchActivity(id),
        fetchTopics(id),
        fetchMyPreferences(id),
      ]);
      setActivity(detail);
      setTopics(topicList);
      setVersion(mine.version);
      setSaved(mine.topicIds);
      setDraft(mine.topicIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setActivity(null);
      setTopics(null);
    }
  }, []);

  useEffect(() => {
    if (activityId) void load(activityId);
  }, [activityId, load]);

  const readOnly = activity !== null && activity.phase !== "FILLING";
  const maxPreferences = activity?.maxPreferences ?? 3;
  const dirty = useMemo(
    () => draft.length > saved.length || draft.some((id, i) => id !== saved[i]),
    [draft, saved],
  );

  const titleOf = useCallback(
    (topicId: string) =>
      topics?.items.find((t) => t.topicId === topicId)?.title ?? topicId.slice(0, 8),
    [topics],
  );

  function add(topicId: string) {
    if (readOnly) return;
    if (draft.includes(topicId)) return;
    if (draft.length >= maxPreferences) {
      setNotice(`最多保存 ${maxPreferences} 个志愿，请先移除一个`);
      return;
    }
    setNotice("");
    setDraft([...draft, topicId]);
  }

  function remove(index: number) {
    if (readOnly) return;
    setDraft(draft.filter((_, i) => i !== index));
  }

  function move(index: number, delta: number) {
    if (readOnly) return;
    const next = [...draft];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
  }

  async function save() {
    if (!activityId || readOnly) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await saveMyPreferences(activityId, draft, version);
      setVersion(result.version);
      setSaved(result.topicIds);
      setDraft(result.topicIds);
      setNotice(
        `已保存第 ${result.version} 版${
          result.submittedAt ? ` · ${new Date(result.submittedAt).toLocaleString("zh-CN")}` : ""
        }`,
      );
    } catch (e) {
      if (e instanceof StudentApiError && e.code === "VERSION_CONFLICT") {
        // 别处改过：只刷新版本与已保存值，保留用户当前的顺序，让他确认后再保存。
        // 如果连草稿一起重置，用户刚才那次调整会静默消失。
        try {
          const latest = await fetchMyPreferences(activityId);
          setVersion(latest.version);
          setSaved(latest.topicIds);
          setNotice(
            `志愿已在别处更新，已加载最新版本（第 ${latest.version} 版）；` +
              `你当前的顺序尚未保存，确认后再点「保存志愿」。`,
          );
        } catch (refreshError) {
          setError(refreshError instanceof Error ? refreshError.message : "刷新失败");
        }
      } else {
        setError(e instanceof Error ? e.message : "保存失败");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h1 className="page-head">志愿填报</h1>
      <p className="lead">
        按偏好顺序保存 1～{maxPreferences} 个题目。志愿只影响处理次序，不锁定名额；截止后不可修改。
      </p>

      {activities.length === 0 && <p className="text-muted">暂无已发布的活动你在名单内。</p>}

      {activities.length > 0 && (
        <div className="field-row" style={{ marginBottom: 12 }}>
          <label className="label-inline" htmlFor="pref-activity">活动</label>
          <select
            id="pref-activity"
            className="select"
            value={activityId}
            onChange={(e) => setActivityId(e.target.value)}
            disabled={busy}
          >
            {activities.map((a) => (
              <option key={a.activityId} value={a.activityId}>
                {a.title}（{a.phase}）
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {readOnly && (
        <p className="error">
          当前阶段为 {activity?.phase}，志愿已锁定，只能查看。
        </p>
      )}

      {topics && (
        <>
          <h2 className="section-title">题目</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th align="left">题目</th>
                <th align="left">名额</th>
                <th align="left">热度</th>
                <th align="left">要求</th>
                <th align="left">操作</th>
              </tr>
            </thead>
            <tbody>
              {topics.items.filter(isStudentTopic).map((topic) => {
                const picked = draft.indexOf(topic.topicId);
                return (
                  <tr key={topic.topicId}>
                    <td>
                      <strong>{topic.title}</strong>
                      {topic.tags.length > 0 && (
                        <div className="text-muted" style={{ fontSize: 12 }}>
                          {topic.tags.join(" · ")}
                        </div>
                      )}
                    </td>
                    <td>{topic.capacity}</td>
                    <td>{topic.heat.preferenceCount}</td>
                    <td style={{ fontSize: 13 }}>
                      {topic.eligibilityDescription || "无"}
                      {!topic.canChoose && (
                        <div className="error">你不符合该题要求</div>
                      )}
                    </td>
                    <td>
                      {picked >= 0 ? (
                        <span className="badge">已加入（第 {picked + 1} 志愿）</span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => add(topic.topicId)}
                          disabled={readOnly || !topic.canChoose || busy}
                        >
                          加入志愿
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h2 className="section-title">我的志愿（{draft.length}/{maxPreferences}）</h2>
          {draft.length === 0 ? (
            <p className="text-muted">
              还没有保存志愿。只保存一部分是允许的，但系统只会按你填写的顺序尝试。
            </p>
          ) : (
            <ol>
              {draft.map((topicId, index) => (
                <li key={topicId} style={{ marginBottom: 6 }}>
                  {titleOf(topicId)}{" "}
                  <button type="button" className="btn btn-sm" onClick={() => move(index, -1)} disabled={readOnly || index === 0 || busy}>
                    上移
                  </button>{" "}
                  <button type="button" className="btn btn-sm" onClick={() => move(index, 1)} disabled={readOnly || index === draft.length - 1 || busy}>
                    下移
                  </button>{" "}
                  <button type="button" className="btn btn-sm" onClick={() => remove(index)} disabled={readOnly || busy}>
                    移除
                  </button>
                </li>
              ))}
            </ol>
          )}

          <p>
            <button type="button" className="btn btn-primary" onClick={save} disabled={readOnly || !dirty || busy}>
              {busy ? "保存中…" : dirty ? "保存志愿" : "已是最新"}
            </button>{" "}
            <small className="text-muted">
              当前版本 {version}
              {saved.length > 0 ? `，已保存 ${saved.length} 个志愿` : "，尚未保存"}
            </small>
          </p>
        </>
      )}
    </div>
  );
}
