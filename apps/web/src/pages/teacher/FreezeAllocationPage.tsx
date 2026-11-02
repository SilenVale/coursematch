import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type {
  EvidenceView,
  OperationAction,
  ParticipantView,
  TeacherResultsView,
  TeacherTopicView,
} from "@coursematch/shared";
import { listParticipants, listTopics, getActivity } from "./configApi";
import {
  apiAllocate,
  apiClose,
  apiEvidence,
  apiFreezeGet,
  apiFreezePost,
  apiTeacherResults,
} from "./freezeApi";
import { DevTrialPanel } from "./DevTrialPanel";

type CourseOutlet = { activityId: string };

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "已分配",
  UNALLOCATED: "落选",
  NOT_SUBMITTED: "未提交",
};

const ACTION_LABEL: Record<OperationAction, string> = {
  CREATE_ACTIVITY: "创建活动",
  UPDATE_ACTIVITY: "更新活动",
  REPLACE_ROSTER: "替换名单",
  CREATE_TOPIC: "创建班",
  UPDATE_TOPIC: "更新班",
  DELETE_TOPIC: "删除班",
  PUBLISH_ACTIVITY: "发布",
  SAVE_PREFERENCES: "保存志愿",
  FREEZE_ACTIVITY: "冻结快照",
  ALLOCATE_ACTIVITY: "主分配",
  VOID_ACTIVITY: "作废",
  CLOSE_ACTIVITY: "关闭",
};

export function FreezeAllocationPage() {
  const { activityId } = useOutletContext<CourseOutlet>();
  const [freezeState, setFreezeState] = useState<string>("—");
  const [results, setResults] = useState<TeacherResultsView | null>(null);
  const [participants, setParticipants] = useState<ParticipantView[]>([]);
  const [topics, setTopics] = useState<TeacherTopicView[]>([]);
  const [evidence, setEvidence] = useState<EvidenceView | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [activityTitle, setActivityTitle] = useState("");

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

  useEffect(() => {
    if (!activityId) return;
    getActivity(activityId)
      .then((a) => setActivityTitle(a.title))
      .catch(() => setActivityTitle(""));
  }, [activityId]);

  useEffect(() => {
    if (!activityId || results?.preparation !== "READY") return;
    Promise.all([listParticipants(activityId), listTopics(activityId)])
      .then(([p, t]) => {
        setParticipants(p.items);
        setTopics(t.items as TeacherTopicView[]);
      })
      .catch(() => {
        setParticipants([]);
        setTopics([]);
      });
  }, [activityId, results?.preparation]);

  const participantById = useMemo(() => {
    const m = new Map<string, ParticipantView>();
    for (const p of participants) m.set(p.participantId, p);
    return m;
  }, [participants]);

  const topicTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of topics) m.set(t.topicId, t.title);
    return m;
  }, [topics]);

  const sortedRows = useMemo(() => {
    if (results?.preparation !== "READY") return [];
    return [...results.items].sort((a, b) => a.lotteryNumber - b.lotteryNumber);
  }, [results]);

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

  async function loadEvidence() {
    if (!activityId) return;
    setEvidenceBusy(true);
    setError(null);
    try {
      const ev = await apiEvidence(activityId);
      setEvidence(ev);
      setEvidenceOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEvidenceBusy(false);
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
          disabled={busy || evidenceBusy || !activityId}
          onClick={() => void loadEvidence()}
        >
          {evidenceBusy ? "加载证据…" : "查看证据"}
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

      {evidenceOpen && evidence && (
        <section className="evidence-panel" aria-labelledby="evidence-heading">
          <div className="evidence-panel-head">
            <h3 id="evidence-heading" className="section-title" style={{ margin: 0 }}>
              操作证据
            </h3>
            <button type="button" className="btn btn-sm" onClick={() => setEvidenceOpen(false)}>
              收起
            </button>
          </div>
          <ul className="text-muted" style={{ margin: "8px 0", paddingLeft: 18 }}>
            <li>
              冻结快照：{" "}
              {evidence.snapshot
                ? `${evidence.snapshot.id}（${new Date(evidence.snapshot.frozenAt).toLocaleString("zh-CN")}）`
                : "无"}
            </li>
            <li>
              分配批次：{" "}
              {evidence.batch
                ? `${evidence.batch.id}（${new Date(evidence.batch.executedAt).toLocaleString("zh-CN")}）`
                : "无"}
            </li>
          </ul>
          {evidence.operations.length === 0 ? (
            <p className="text-muted">暂无操作日志。</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {evidence.operations.map((op) => (
                  <tr key={op.id}>
                    <td>{new Date(op.occurredAt).toLocaleString("zh-CN")}</td>
                    <td>{ACTION_LABEL[op.action] ?? op.action}</td>
                    <td>{op.outcome === "SUCCEEDED" ? "成功" : "失败"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {activityId && (
        <DevTrialPanel
          activityId={activityId}
          activityTitle={activityTitle}
          onChanged={() => void refresh()}
        />
      )}

      {results?.preparation === "READY" && (
        <section style={{ marginTop: 20 }}>
          <h2 className="section-title">分配汇总</h2>
          <p className="text-muted">
            已分配 {results.counts.assigned} · 落选 {results.counts.unallocated} · 未提交{" "}
            {results.counts.notSubmitted}
          </p>
          <p className="text-muted" style={{ fontSize: 13 }}>
            下表按<strong>抽签序号</strong>排序（冻结时随机生成，数字越小越优先），不是学号顺序。同班竞争时，在容量范围内序号靠前者「已分配」，其余为「落选」。
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>学号</th>
                <th>姓名</th>
                <th>状态</th>
                <th>班</th>
                <th>抽签序号</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const person = participantById.get(row.participantId);
                const topicLabel =
                  row.topicId != null
                    ? (topicTitleById.get(row.topicId) ?? row.topicId.slice(0, 8) + "…")
                    : "—";
                return (
                  <tr key={row.participantId}>
                    <td>{person?.studentNumber ?? "—"}</td>
                    <td>{person?.name ?? row.participantId.slice(0, 8) + "…"}</td>
                    <td>{STATUS_LABEL[row.status] ?? row.status}</td>
                    <td>{topicLabel}</td>
                    <td>{row.lotteryNumber}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
