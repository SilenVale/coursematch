/**
 * 石俊贤 · M2 发布前检查与发布/作废。
 *
 * 「未齐备不能发布」是 V1 优秀线第 5 条。这里的清单只是给教师的提示，
 * 真正的判定在服务端 `POST .../publish`；按钮禁用不代表授权。
 */
import { useState } from "react";
import type { ActivityView } from "@coursematch/shared";
import { ApiError, publishActivity, voidActivity } from "./configApi";
import { Badge, ErrorBanner, formatBeijing, toApiError } from "./configUi";

type CheckState = "ok" | "fail" | "unknown";

interface CheckItem {
  label: string;
  state: CheckState;
  detail: string;
}

function buildChecklist(params: {
  activity: ActivityView;
  participantCount: number | null;
  topicCount: number | null;
  topicPending: boolean;
}): CheckItem[] {
  const { activity, participantCount, topicCount, topicPending } = params;
  const items: CheckItem[] = [];

  items.push({
    label: "活动名称",
    state: activity.title.trim() ? "ok" : "fail",
    detail: activity.title.trim() ? activity.title : "未填写",
  });

  const start = new Date(activity.startAt).getTime();
  const deadline = new Date(activity.deadlineAt).getTime();
  const timeOk = Number.isFinite(start) && Number.isFinite(deadline) && start < deadline;
  items.push({
    label: "开始与截止时间",
    state: timeOk ? "ok" : "fail",
    detail: timeOk
      ? `${formatBeijing(activity.startAt)} → ${formatBeijing(activity.deadlineAt)}`
      : "截止时间必须晚于开始时间",
  });

  items.push({
    label: "最大志愿数",
    state: activity.maxPreferences >= 1 && activity.maxPreferences <= 3 ? "ok" : "fail",
    detail: `${activity.maxPreferences} 个`,
  });

  items.push({
    label: "参与名单",
    state:
      participantCount === null ? "unknown" : participantCount > 0 ? "ok" : "fail",
    detail:
      participantCount === null
        ? "尚未加载"
        : participantCount > 0
          ? `${participantCount} 人`
          : "名单为空，发布后没有学生能选择本活动",
  });

  items.push({
    label: "开设课程",
    state: topicPending ? "unknown" : topicCount === null ? "unknown" : topicCount > 0 ? "ok" : "fail",
    detail: topicPending
      ? "开设课程接口尚未实现（501），无法确认"
      : topicCount === null
        ? "尚未加载"
        : topicCount > 0
          ? `${topicCount} 门可选课`
          : "至少需要一门可选课",
  });

  return items;
}

const STATE_LABEL: Record<CheckState, string> = { ok: "通过", fail: "未通过", unknown: "未知" };
const STATE_TONE: Record<CheckState, "ok" | "warn" | "muted"> = {
  ok: "ok",
  fail: "warn",
  unknown: "muted",
};

export function PublishPanel({
  activity,
  participantCount,
  topicCount,
  topicPending,
  onPublished,
  onVoided,
}: {
  activity: ActivityView;
  participantCount: number | null;
  topicCount: number | null;
  topicPending: boolean;
  onPublished: (next: ActivityView) => void;
  onVoided: () => void;
}) {
  const [busy, setBusy] = useState<"publish" | "void" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [voidOpen, setVoidOpen] = useState(false);

  const isDraft = activity.lifecycle === "DRAFT";
  const canVoid = activity.lifecycle === "PUBLISHED";
  const isTerminal = activity.lifecycle === "VOID" || activity.lifecycle === "CLOSED";
  const checklist = buildChecklist({ activity, participantCount, topicCount, topicPending });
  const blocking = checklist.filter((c) => c.state === "fail");

  async function handlePublish() {
    setBusy("publish");
    setError(null);
    setNotice("");
    try {
      const next = await publishActivity(activity.activityId, activity.configVersion);
      setNotice(`活动已发布，配置版本 v${next.configVersion}，学生现在可以填报志愿。`);
      onPublished(next);
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError);
    } finally {
      setBusy(null);
    }
  }

  async function handleVoid() {
    setBusy("void");
    setError(null);
    setNotice("");
    try {
      const result = await voidActivity(activity.activityId, voidReason.trim());
      setNotice(`活动已作废（${formatBeijing(result.voidAt)}）。原因：${result.reason}`);
      setVoidOpen(false);
      setVoidReason("");
      onVoided();
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="cm-panel">
      <header className="cm-panel-head">
        <h2>发布前检查</h2>
        <span className="cm-muted">
          {isDraft
            ? "草稿状态，配置可自由修改"
            : canVoid
              ? "已发布：影响公平性的字段已锁定"
              : "当前状态不可发布"}
        </span>
      </header>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      {notice && <p className="cm-notice">{notice}</p>}

      {/* 已作废/已关闭的活动不再展示齐备性清单：此时发布已无意义。 */}
      {!isTerminal && (
        <ul className="cm-checklist">
          {checklist.map((item) => (
            <li key={item.label} className={`cm-check cm-check-${item.state}`}>
              <Badge tone={STATE_TONE[item.state]}>{STATE_LABEL[item.state]}</Badge>
              <span className="cm-check-label">{item.label}</span>
              <span className="cm-muted">{item.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {isDraft && blocking.length > 0 && (
        <p className="cm-hint">
          还有 {blocking.length} 项未通过：{blocking.map((b) => b.label).join("、")}。
          服务端会在发布时再校验一次。
        </p>
      )}

      <div className="cm-actions">
        <button
          type="button"
          onClick={handlePublish}
          disabled={!isDraft || busy !== null || blocking.length > 0}
          title={
            !isDraft
              ? "只有草稿可以发布"
              : blocking.length > 0
                ? `还有 ${blocking.length} 项未通过：${blocking.map((b) => b.label).join("、")}`
                : ""
          }
        >
          {busy === "publish" ? "发布中…" : "发布活动"}
        </button>

        {canVoid && !voidOpen && (
          <button type="button" onClick={() => setVoidOpen(true)} disabled={busy !== null}>
            作废活动
          </button>
        )}
      </div>

      {voidOpen && (
        <div className="cm-void">
          <p>
            作废后本活动变为只读，学生不能再提交或查看为可填状态；原活动不会删除，
            需要重新建活动并重新收集志愿。
          </p>
          <label className="cm-field">
            <span>作废原因（必填，最多 500 字）</span>
            <textarea
              rows={3}
              value={voidReason}
              maxLength={500}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </label>
          <div className="cm-actions">
            <button
              type="button"
              onClick={handleVoid}
              disabled={voidReason.trim().length === 0 || busy !== null}
            >
              {busy === "void" ? "提交中…" : "确认作废"}
            </button>
            <button type="button" onClick={() => setVoidOpen(false)} disabled={busy !== null}>
              取消
            </button>
          </div>
        </div>
      )}

      {!isDraft && !canVoid && (
        <p className="cm-muted">
          只有「已发布且尚未成功分配」的活动可以作废；当前状态为 {activity.lifecycle}。
        </p>
      )}
    </section>
  );
}
