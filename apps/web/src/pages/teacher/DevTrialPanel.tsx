import { useCallback, useEffect, useState } from "react";
import {
  fetchDevToolsEnabled,
  fetchTrialPreview,
  postReachDeadline,
  postResetTrial,
  postSimulatePreferences,
  type SimulateStrategy,
} from "./devTrialApi";

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

  async function handleReachDeadline() {
    setBusy("deadline");
    setError("");
    setNotice("");
    try {
      const result = (await postReachDeadline(activityId)) as {
        alreadyAtDeadline: boolean;
        adjustedStart: boolean;
        adjustedDeadline: boolean;
      };
      if (result.alreadyAtDeadline) {
        setNotice("已是「已截止」状态，请用上方「生成冻结快照」等正式按钮继续。");
      } else {
        setNotice(
          "已到达截止。请用上方「生成冻结快照 → 执行主分配 → 查看证据」走正式主流程。",
        );
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "截止失败");
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
            联调只负责<strong>造数据、造阶段</strong>：模拟填报 →（可选）立即截止 →
            再用上方<strong>正式按钮</strong>冻结与主分配。已截止时点 ① 会自动把截止延 7
            天以便重填（仅 Dev）。正式环境请关闭 <code>ENABLE_DEV_TOOLS</code>。
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
              onClick={() => void handleReachDeadline()}
            >
              {busy === "deadline" ? "处理中…" : "③ 立即到达截止"}
            </button>
          </div>

          {notice && <p className="notice">{notice}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </section>
  );
}
