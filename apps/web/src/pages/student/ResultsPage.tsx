import { useCallback, useEffect, useState } from "react";
import type { ActivitySummary, PersonalResultView } from "@coursematch/shared";
import { fetchActivity, fetchMyResult, fetchStudentActivities } from "./student-api";

function statusLabel(view: PersonalResultView): string {
  if (view.preparation === "PENDING") return "等待分配";
  if (view.status === "ASSIGNED") return "已分配";
  if (view.status === "UNALLOCATED") return "志愿均未命中";
  return "未提交志愿";
}

export function ResultsPage() {
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [activityId, setActivityId] = useState("");
  const [activityTitle, setActivityTitle] = useState("");
  const [result, setResult] = useState<PersonalResultView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchStudentActivities()
      .then((items) => {
        setActivities(items);
        const demo =
          items.find((a) => a.title.includes("截止联调")) ??
          items.find((a) => a.phase !== "FILLING") ??
          items[0];
        if (demo) setActivityId(demo.activityId);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setResult(null);
      setActivityTitle("");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (activityId) void load(activityId);
  }, [activityId, load]);

  return (
    <div className="card">
      <h1 className="page-head">我的结果</h1>
      <p className="lead">
        只读服务端分配结果。区分已分配、志愿均未命中、未提交；不提供补选入口。
      </p>

      {activities.length === 0 && <p className="text-muted">暂无已发布的活动你在名单内。</p>}

      {activities.length > 0 && (
        <div className="field-row" style={{ marginBottom: 12 }}>
          <label className="label-inline" htmlFor="result-activity">活动</label>
          <select
            id="result-activity"
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
          <button type="button" className="btn btn-sm" onClick={() => load(activityId)} disabled={!activityId || busy}>
            刷新
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {result && activityTitle && (
        <section style={{ marginTop: 16 }}>
          <h2 className="section-title">{activityTitle}</h2>
          <p>
            <span className="badge">{statusLabel(result)}</span>
            {result.preparation === "READY" && result.publishedAt && (
              <span className="text-muted" style={{ marginLeft: 8 }}>
                公布于 {new Date(result.publishedAt).toLocaleString("zh-CN")}
              </span>
            )}
          </p>

          {result.preparation === "PENDING" && (
            <p className="text-muted">教师尚未完成主分配，请稍后再查看。</p>
          )}

          {result.preparation === "READY" && (
            <ul className="text-muted" style={{ lineHeight: 1.6 }}>
              <li>冻结序号：<span className="text-mono">{result.lotteryNumber}</span></li>
              {result.status === "ASSIGNED" && (
                <>
                  <li>命中题目 ID：<span className="text-mono">{result.topicId}</span></li>
                  <li>对应志愿顺位：第 {result.matchedRank} 志愿</li>
                </>
              )}
              {result.status === "UNALLOCATED" && <li>你已提交志愿，但各轮均未获得名额。</li>}
              {result.status === "NOT_SUBMITTED" && <li>截止前未保存有效志愿，不参与分配。</li>}
              {result.rounds.length > 0 && (
                <li>轮次明细（{result.rounds.length} 条）见接口返回；页面仅展示结论。</li>
              )}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
