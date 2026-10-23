import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { TeacherResultsView } from "@coursematch/shared";
import {
  apiAllocate,
  apiClose,
  apiEvidence,
  apiFreezeGet,
  apiFreezePost,
  apiTeacherResults,
} from "./freezeApi";

type CourseOutlet = { activityId: string };

export function FreezeAllocationPage() {
  const { activityId } = useOutletContext<CourseOutlet>();
  const [freezeState, setFreezeState] = useState<string>("—");
  const [results, setResults] = useState<TeacherResultsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      <h2 className="section-title">分配结果</h2>
      <p className="lead">截止后生成冻结快照，再执行一次主分配。</p>

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
