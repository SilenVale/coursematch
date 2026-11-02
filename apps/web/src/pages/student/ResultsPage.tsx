import { useCallback, useEffect, useState } from "react";
import type { ActivitySummary, PersonalResultView } from "@coursematch/shared";
import { PHASE_LABEL } from "../teacher/configUi";
import {
  fetchActivity,
  fetchMyResult,
  fetchStudentActivities,
  fetchTopics,
} from "./student-api";

function outcomeSentence(
  result: PersonalResultView,
  topicTitle: string | null,
): { headline: string; tone: "ok" | "muted" | "wait" } {
  if (result.preparation === "PENDING") {
    return { headline: "结果还没出来，请稍后再看。", tone: "wait" };
  }
  if (result.status === "ASSIGNED") {
    const name = topicTitle?.trim() || "你的班";
    return { headline: `已选上：${name}。`, tone: "ok" };
  }
  if (result.status === "UNALLOCATED") {
    return { headline: "本轮未选上。", tone: "muted" };
  }
  return { headline: "截止前未提交选择，未参与本轮分配。", tone: "muted" };
}

export function ResultsPage() {
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [activityId, setActivityId] = useState("");
  const [activityTitle, setActivityTitle] = useState("");
  const [topicTitle, setTopicTitle] = useState<string | null>(null);
  const [result, setResult] = useState<PersonalResultView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchStudentActivities()
      .then((items) => {
        setActivities(items);
        if (items[0]) setActivityId(items[0].activityId);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载活动失败"));
  }, []);

  const load = useCallback(async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const [detail, mine] = await Promise.all([fetchActivity(id), fetchMyResult(id)]);
      setActivityTitle(detail.title);
      setResult(mine);

      let title: string | null = null;
      if (mine.preparation === "READY" && mine.status === "ASSIGNED" && mine.topicId) {
        const topics = await fetchTopics(id);
        title = topics.items.find((t) => t.topicId === mine.topicId)?.title ?? null;
      }
      setTopicTitle(title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setResult(null);
      setActivityTitle("");
      setTopicTitle(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (activityId) void load(activityId);
  }, [activityId, load]);

  const outcome = result ? outcomeSentence(result, topicTitle) : null;

  return (
    <div className="card">
      <h1 className="page-head">我的结果</h1>
      <p className="lead">看本轮选课是否选上班级，数据以教师公布为准。</p>

      {activities.length === 0 && <p className="text-muted">暂无已发布的选课。</p>}

      {activities.length > 0 && (
        <div className="field-row" style={{ marginBottom: 16 }}>
          <label className="label-inline" htmlFor="result-activity">
            选课
          </label>
          <select
            id="result-activity"
            className="select"
            value={activityId}
            onChange={(e) => setActivityId(e.target.value)}
            disabled={busy}
          >
            {activities.map((a) => (
              <option key={a.activityId} value={a.activityId}>
                {a.title}（{PHASE_LABEL[a.phase] ?? a.phase}）
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => activityId && void load(activityId)}
            disabled={!activityId || busy}
          >
            {busy ? "刷新中…" : "刷新"}
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {result && activityTitle && outcome && (
        <section className="student-result-outcome">
          <p className="text-muted" style={{ margin: "0 0 8px" }}>
            {activityTitle}
          </p>
          <p
            className={`student-result-headline student-result-headline--${outcome.tone}`}
            role="status"
          >
            {outcome.headline}
          </p>
          {result.preparation === "READY" && result.publishedAt && (
            <p className="text-muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
              公布时间 {new Date(result.publishedAt).toLocaleString("zh-CN")}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
