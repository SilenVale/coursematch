import { useCallback, useEffect, useState } from "react";
import type { ActivitySummary, TeacherResultsView } from "@coursematch/shared";
import { apiActivities } from "../../api/client";
import {
  apiAllocate,
  apiClose,
  apiEvidence,
  apiFreezeGet,
  apiFreezePost,
  apiTeacherResults,
} from "./freezeApi";

export function FreezeAllocationPage() {
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [activityId, setActivityId] = useState("");
  const [freezeState, setFreezeState] = useState<string>("—");
  const [results, setResults] = useState<TeacherResultsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadActivities = useCallback(async () => {
    const res = await apiActivities();
    const items = res.data.items;
    setActivities(items);
    if (!activityId && items.length > 0) {
      const demo = items.find((a) => a.title.includes("截止联调")) ?? items[0];
      setActivityId(demo.activityId);
    }
  }, [activityId]);

  const refresh = useCallback(async () => {
    if (!activityId) return;
    setError(null);
    const f = await apiFreezeGet(activityId);
    setFreezeState(
      f.preparation === "READY"
        ? `已冻结 ${f.snapshotId?.slice(0, 8)}…`
        : f.preparation === "FAILED"
          ? `失败：${f.lastFailure.message}`
          : "待冻结",
    );
    const r = await apiTeacherResults(activityId);
    setResults(r);
  }, [activityId]);

  useEffect(() => {
    loadActivities().catch((e) => setError(String(e)));
  }, [loadActivities]);

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, [refresh]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h1 className="page-head">冻结与主分配</h1>
      <p className="lead">
        截止后生成冻结快照，再执行一次主分配。算法见 <code>packages/allocation</code>。
      </p>

      <div className="field-row" style={{ marginBottom: 12 }}>
        <label className="label-inline" htmlFor="freeze-activity">活动</label>
        <select
          id="freeze-activity"
          className="select"
          value={activityId}
          onChange={(e) => setActivityId(e.target.value)}
          style={{ minWidth: 280 }}
        >
          {activities.map((a) => (
            <option key={a.activityId} value={a.activityId}>
              {a.title}（{a.lifecycle} / {a.phase}）
            </option>
          ))}
        </select>
      </div>

      <p className="text-muted">
        冻结状态：<span className="text-mono">{freezeState}</span>
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="btn-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !activityId}
          onClick={() => run(() => apiFreezePost(activityId!).then())}
        >
          生成冻结快照
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !activityId}
          onClick={() => run(() => apiAllocate(activityId!).then())}
        >
          执行主分配
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !activityId}
          onClick={() =>
            run(async () => {
              const ev = await apiEvidence(activityId!);
              console.info("evidence", ev);
              window.alert(
                ev.snapshot
                  ? `快照 ${ev.snapshot.id.slice(0, 8)}…，操作 ${ev.operations.length} 条（详情见控制台）`
                  : "暂无快照",
              );
            })
          }
        >
          查看证据
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !activityId}
          onClick={() =>
            run(async () => {
              const reason = window.prompt("关闭原因（必填）");
              if (!reason?.trim()) throw new Error("已取消");
              await apiClose(activityId!, reason.trim());
            })
          }
        >
          关闭活动
        </button>
      </div>

      {results?.preparation === "READY" && (
        <section style={{ marginTop: 20 }}>
          <h2 className="section-title">分配汇总</h2>
          <p className="text-muted text-mono">
            已分配 {results.counts.assigned} · 落选 {results.counts.unallocated} · 未提交{" "}
            {results.counts.notSubmitted}
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>参与者</th>
                <th>状态</th>
                <th>题目</th>
                <th>序号</th>
              </tr>
            </thead>
            <tbody>
              {results.items.map((row) => (
                <tr key={row.participantId}>
                  <td className="text-mono">{row.participantId.slice(0, 8)}…</td>
                  <td>{row.status}</td>
                  <td className="text-mono">{row.topicId ?? "—"}</td>
                  <td>{row.lotteryNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
