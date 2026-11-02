import { useCallback, useEffect, useState } from "react";
import {
  fetchDevToolsEnabled,
  fetchTrialPreview,
  postResetTrial,
  postRunAllocationTrial,
  postSimulatePreferences,
  type SimulateStrategy,
} from "./devTrialApi";

type StepKey = "simulate" | "deadline" | "freeze" | "allocate";

const STEP_LABEL: Record<StepKey, string> = {
  simulate: "模拟全员填报",
  deadline: "联调截止",
  freeze: "生成冻结快照",
  allocate: "执行主分配",
};

export function DevTrialPanel({
  activityId,
  activityTitle,
  onChanged,
}: {
  activityId: string;
  activityTitle?: string;
  onChanged: () => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{
    participantCount: number;
    accountReadyCount: number;
    topicCount: number;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [simStrategy, setSimStrategy] = useState<SimulateStrategy>("same_first");
  const [skipUnfilled, setSkipUnfilled] = useState(0);

  const [runModal, setRunModal] = useState(false);
  const [runSteps, setRunSteps] = useState<Record<StepKey, boolean>>({
    simulate: true,
    deadline: true,
    freeze: true,
    allocate: true,
  });
  const [runProgress, setRunProgress] = useState<
    { key: StepKey; status: "pending" | "active" | "done" | "fail"; detail?: string }[]
  >([]);

  const loadPreview = useCallback(async () => {
    if (!activityId || !enabled) return;
    try {
      setPreview(await fetchTrialPreview(activityId));
    } catch {
      setPreview(null);
    }
  }, [activityId, enabled]);

  useEffect(() => {
    fetchDevToolsEnabled().then(setEnabled);
  }, []);

  useEffect(() => {
    if (open) void loadPreview();
  }, [open, loadPreview]);

  if (!enabled) return null;

  async function handleSimulate() {
    setBusy("simulate");
    setError("");
    setNotice("");
    try {
      const result = (await postSimulatePreferences(activityId, {
        strategy: simStrategy,
        skipUnfilledCount: skipUnfilled,
      })) as {
        writtenCount: number;
        skippedNoAccount: string[];
        skippedUnfilled: string[];
      };
      setNotice(
        `已写入 ${result.writtenCount} 人` +
          (result.skippedUnfilled.length
            ? `；留空 ${result.skippedUnfilled.length} 人` : "") +
          (result.skippedNoAccount.length
            ? `；未开号 ${result.skippedNoAccount.length} 人` : ""),
      );
      onChanged();
      await loadPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : "模拟失败");
    } finally {
      setBusy(null);
    }
  }

  async function handleReset() {
    const title = activityTitle?.trim() || "本课种";
    if (
      !window.confirm(
        `清空「${title}」的联调数据？\n将删除：全员选择、冻结快照、分配结果。\n不会删除：名单、班、账号。`,
      )
    ) {
      return;
    }
    setBusy("reset");
    setError("");
    setNotice("");
    try {
      await postResetTrial(activityId);
      setNotice("已清空本轮联调数据，可重新模拟或让学生改选。");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "清空失败");
    } finally {
      setBusy(null);
    }
  }

  async function handleRunTrial() {
    const keys: StepKey[] = ["simulate", "deadline", "freeze", "allocate"];
    const selected = keys.filter((k) => runSteps[k]);
    setRunProgress(selected.map((k) => ({ key: k, status: "active" as const })));
    setBusy("run");
    setError("");

    try {
      const data = (await postRunAllocationTrial(activityId, {
        ...runSteps,
        strategy: simStrategy,
        skipUnfilledCount: skipUnfilled,
      })) as {
        steps: { step: string; ok: boolean; detail?: unknown }[];
        allocation?: { counts: { assigned: number; unallocated: number; notSubmitted: number } };
      };

      setRunProgress(
        selected.map((k, i) => {
          const row = data.steps[i];
          const detail =
            row?.step === "simulate" && row.detail && typeof row.detail === "object"
              ? `写入 ${(row.detail as { writtenCount?: number }).writtenCount ?? "?"} 人`
              : row?.step === "allocate" && row.detail && typeof row.detail === "object"
                ? `已分配 ${(row.detail as { counts?: { assigned?: number } }).counts?.assigned ?? "?"}`
                : undefined;
          return { key: k, status: "done" as const, detail };
        }),
      );

      const c = data.allocation?.counts;
      if (c) {
        setNotice(
          `联调完成：已分配 ${c.assigned} · 落选 ${c.unallocated} · 未提交 ${c.notSubmitted}`,
        );
      } else {
        setNotice("联调步骤已完成（未执行主分配）。");
      }
      setRunModal(false);
      onChanged();
    } catch (e) {
      const err = e as Error & { steps?: unknown[] };
      setRunProgress((prev) => {
        const failIdx = prev.findIndex((r) => r.status === "active");
        return prev.map((row, idx) =>
          idx === failIdx ? { ...row, status: "fail", detail: err.message } : row,
        );
      });
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="dev-trial-panel">
      <button
        type="button"
        className="dev-trial-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="dev-trial-badge">Dev 联调</span>
        联调工具 {open ? "▲" : "▼"}
      </button>

      {open && (
        <div className="dev-trial-body">
          <p className="text-muted" style={{ marginTop: 0 }}>
            第 1 轮分配测试：模拟填报、清空、一键跑通冻结与主分配。已截止时
            ①/③ 会自动把截止延至 7 天后（仅 Dev）。正式环境请关闭{" "}
            <code>ENABLE_DEV_TOOLS</code>。
          </p>
          {preview && (
            <p className="text-muted">
              名单 {preview.participantCount} 人 · 已开号 {preview.accountReadyCount} · 班{" "}
              {preview.topicCount} 个
            </p>
          )}

          <div className="dev-trial-options">
            <label>
              填报策略
              <select
                value={simStrategy}
                disabled={busy !== null}
                onChange={(e) => setSimStrategy(e.target.value as SimulateStrategy)}
              >
                <option value="same_first">全班同选第一个班</option>
                <option value="round_robin">按学号轮询各班</option>
                <option value="random">随机（按学号稳定）</option>
              </select>
            </label>
            <label>
              留空人数
              <input
                type="number"
                min={0}
                max={9999}
                value={skipUnfilled}
                disabled={busy !== null}
                onChange={(e) => setSkipUnfilled(Number(e.target.value) || 0)}
              />
            </label>
          </div>

          <div className="btn-row dev-trial-actions">
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => void handleSimulate()}
            >
              {busy === "simulate" ? "写入中…" : "① 模拟全员填报"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => void handleReset()}
            >
              {busy === "reset" ? "清空中…" : "② 清空本轮联调"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={() => {
                setRunModal(true);
                setRunProgress([]);
                setError("");
              }}
            >
              ③ 一键跑通分配
            </button>
          </div>

          {notice && <p className="notice">{notice}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {runModal && (
        <div className="dev-trial-modal-backdrop" role="dialog" aria-modal="true">
          <div className="dev-trial-modal card">
            <h3 className="section-title">一键跑通分配</h3>
            <p className="text-muted">
              {activityTitle ? `「${activityTitle}」` : "本课种"} · 任一步失败即停止
            </p>
            <ul className="dev-trial-step-checks">
              {(Object.keys(STEP_LABEL) as StepKey[]).map((key) => (
                <li key={key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={runSteps[key]}
                      disabled={busy === "run"}
                      onChange={(e) =>
                        setRunSteps({ ...runSteps, [key]: e.target.checked })
                      }
                    />
                    {STEP_LABEL[key]}
                  </label>
                </li>
              ))}
            </ul>
            {runProgress.length > 0 && (
              <ol className="dev-trial-step-progress">
                {runProgress.map((row) => (
                  <li key={row.key} className={`dev-trial-step-${row.status}`}>
                    {row.status === "done" && "✓ "}
                    {row.status === "active" && "● "}
                    {row.status === "fail" && "✗ "}
                    {row.status === "pending" && "○ "}
                    {STEP_LABEL[row.key]}
                    {row.detail ? ` — ${row.detail}` : ""}
                  </li>
                ))}
              </ol>
            )}
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={busy === "run"}
                onClick={() => setRunModal(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy === "run"}
                onClick={() => void handleRunTrial()}
              >
                {busy === "run" ? "执行中…" : "开始执行"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
