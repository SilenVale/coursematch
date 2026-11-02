import { useCallback, useEffect, useMemo, useState } from "react";
import { offerSummaryLine, unpackOfferDescription } from "../teacher/topicOfferFormat";
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
      setDraft(mine.topicIds.slice(0, 1));
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
  const selectedId = draft[0] ?? "";
  const dirty = useMemo(() => {
    const savedOne = saved[0] ?? "";
    return selectedId !== savedOne;
  }, [selectedId, saved]);

  const titleOf = useCallback(
    (topicId: string) =>
      topics?.items.find((t) => t.topicId === topicId)?.title ?? topicId.slice(0, 8),
    [topics],
  );

  function choose(topicId: string) {
    if (readOnly) return;
    setNotice("");
    setDraft([topicId]);
  }

  function clearChoice() {
    if (readOnly) return;
    setDraft([]);
  }

  async function save() {
    if (!activityId || readOnly) return;
    if (draft.length === 0) {
      setNotice("请先选择 1 个授课班再保存");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await saveMyPreferences(activityId, draft.slice(0, 1), version);
      setVersion(result.version);
      setSaved(result.topicIds);
      setDraft(result.topicIds.slice(0, 1));
      setNotice(
        `已保存第 ${result.version} 版${
          result.submittedAt ? ` · ${new Date(result.submittedAt).toLocaleString("zh-CN")}` : ""
        }`,
      );
    } catch (e) {
      if (e instanceof StudentApiError && e.code === "VERSION_CONFLICT") {
        try {
          const latest = await fetchMyPreferences(activityId);
          setVersion(latest.version);
          setSaved(latest.topicIds);
          setNotice(
            `志愿已在别处更新，已加载最新版本（第 ${latest.version} 版）；` +
              `你当前的选择尚未保存，确认后再点「保存选择」。`,
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
        每门课（每轮选课）选 1 位老师所在的班；可同时参与任意多门已发布的选课。截止后不可修改。
      </p>

      {activities.length === 0 && <p className="text-muted">暂无已发布的选课。</p>}

      {activities.length > 0 && (
        <div className="field-row" style={{ marginBottom: 12 }}>
          <label className="label-inline" htmlFor="pref-activity">选课</label>
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
          当前阶段为 {activity?.phase}，选择已锁定，只能查看。
        </p>
      )}

      {topics && (
        <>
          <h2 className="section-title">可选班</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th align="left">班 / 教师</th>
                <th align="left">名额</th>
                <th align="left">热度</th>
                <th align="left">要求</th>
                <th align="left">操作</th>
              </tr>
            </thead>
            <tbody>
              {topics.items.filter(isStudentTopic).map((topic) => {
                const picked = selectedId === topic.topicId;
                return (
                  <tr key={topic.topicId}>
                    <td>
                      <strong>{topic.title}</strong>
                      {(() => {
                        const line = offerSummaryLine(
                          unpackOfferDescription(topic.description),
                          "",
                        );
                        return line ? (
                          <div className="text-muted" style={{ fontSize: 12 }}>
                            {line}
                          </div>
                        ) : topic.tags.length > 0 ? (
                          <div className="text-muted" style={{ fontSize: 12 }}>
                            {topic.tags.join(" · ")}
                          </div>
                        ) : null;
                      })()}
                    </td>
                    <td>{topic.capacity}</td>
                    <td>{topic.heat.preferenceCount}</td>
                    <td style={{ fontSize: 13 }}>
                      {topic.eligibilityDescription || "无"}
                      {!topic.canChoose && (
                        <div className="error">你不符合该班要求</div>
                      )}
                    </td>
                    <td>
                      {picked ? (
                        <span className="badge">已选</span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => choose(topic.topicId)}
                          disabled={readOnly || !topic.canChoose || busy}
                        >
                          选这个班
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h2 className="section-title">我的选择</h2>
          {selectedId ? (
            <p>
              {titleOf(selectedId)}{" "}
              <button
                type="button"
                className="btn btn-sm"
                onClick={clearChoice}
                disabled={readOnly || busy}
              >
                改选
              </button>
            </p>
          ) : (
            <p className="text-muted">尚未选择。点「选这个班」后保存即可。</p>
          )}

          <p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={readOnly || !dirty || busy || !selectedId}
            >
              {busy ? "保存中…" : dirty ? "保存选择" : "已是最新"}
            </button>{" "}
            <small className="text-muted">
              当前版本 {version}
              {saved.length > 0 ? "，已保存" : "，尚未保存"}
            </small>
          </p>
        </>
      )}
    </div>
  );
}
