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
      <h1>教师 · 冻结 / 分配 / 结果</h1>
      <p style={{ color: "#555" }}>
        截止后冻结 → 主分配 → 查看汇总 → 填写原因关闭。算法见{" "}
        <code>packages/allocation</code>。
      </p>

      <label>
        活动
        <select
          value={activityId}
          onChange={(e) => setActivityId(e.target.value)}
          style={{ marginLeft: 8, minWidth: 280 }}
        >
          {activities.map((a) => (
            <option key={a.activityId} value={a.activityId}>
              {a.title}（{a.lifecycle} / {a.phase}）
            </option>
          ))}
        </select>
      </label>

      <p>冻结状态：{freezeState}</p>

      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button type="button" disabled={busy || !activityId} onClick={() => run(() => apiFreezePost(activityId!).then())}>
          生成冻结快照
        </button>
        <button type="button" disabled={busy || !activityId} onClick={() => run(() => apiAllocate(activityId!).then())}>
          执行主分配
        </button>
        <button
          type="button"
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
          <h2>分配汇总</h2>
          <p>
            已分配 {results.counts.assigned} · 落选 {results.counts.unallocated} · 未提交{" "}
            {results.counts.notSubmitted}
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                <th align="left">参与者</th>
                <th align="left">状态</th>
                <th align="left">题目</th>
                <th align="left">序号</th>
              </tr>
            </thead>
            <tbody>
              {results.items.map((row) => (
                <tr key={row.participantId}>
                  <td>{row.participantId.slice(0, 8)}…</td>
                  <td>{row.status}</td>
                  <td>{row.topicId ?? "—"}</td>
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
