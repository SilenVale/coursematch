/**
 * 石俊贤 · M2 活动基本信息表单。
 *
 * 只提交真正改动过的字段：契约里 `ActivityPatchInput` 是
 * 「至少一个字段 + expectedConfigVersion」，全量提交会把未改动的字段也算进
 * `changedFields`，审计时看不出教师到底改了什么。
 */
import { useEffect, useMemo, useState } from "react";
import type { ActivityDraftInput, ActivityView, FieldError } from "@coursematch/shared";
import { ApiError, patchActivity } from "./configApi";
import {
  ErrorBanner,
  FieldErrorText,
  fromDateTimeLocal,
  toApiError,
  toDateTimeLocal,
} from "./configUi";

interface FormState {
  title: string;
  description: string;
  startAt: string;
  deadlineAt: string;
  maxPreferences: string;
}

function toForm(activity: ActivityView): FormState {
  return {
    title: activity.title,
    description: activity.description,
    startAt: toDateTimeLocal(activity.startAt),
    deadlineAt: toDateTimeLocal(activity.deadlineAt),
    maxPreferences: String(activity.maxPreferences),
  };
}

export function ActivityBasicsForm({
  activity,
  canEditTitle,
  canEditDescription,
  onSaved,
}: {
  activity: ActivityView;
  /** 草稿可改全部；已发布只能改简介（见 config.ts 的 POST_PUBLISH_EDITABLE）。 */
  canEditTitle: boolean;
  canEditDescription: boolean;
  onSaved: (next: ActivityView) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(activity));
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<ApiError | null>(null);

  // 切换活动或服务端版本变化时，重新以服务端值为准。
  useEffect(() => {
    setForm(toForm(activity));
    setLocalError(null);
  }, [activity.activityId, activity.configVersion]);

  const baseline = useMemo(() => toForm(activity), [activity]);

  const dirty = useMemo<Partial<ActivityDraftInput>>(() => {
    const changed: Partial<ActivityDraftInput> = {};
    if (form.title !== baseline.title) changed.title = form.title;
    if (form.description !== baseline.description) changed.description = form.description;
    if (form.startAt !== baseline.startAt) changed.startAt = fromDateTimeLocal(form.startAt);
    if (form.deadlineAt !== baseline.deadlineAt)
      changed.deadlineAt = fromDateTimeLocal(form.deadlineAt);
    if (form.maxPreferences !== baseline.maxPreferences)
      changed.maxPreferences = Number(form.maxPreferences);
    return changed;
  }, [form, baseline]);

  const hasChange = Object.keys(dirty).length > 0;

  async function handleSave() {
    if (!hasChange || saving) return;
    setSaving(true);
    setLocalError(null);
    try {
      const next = await patchActivity(activity.activityId, {
        ...dirty,
        expectedConfigVersion: activity.configVersion,
      });
      onSaved(next);
    } catch (err) {
      const apiError = toApiError(err);
      setLocalError(apiError);
    } finally {
      setSaving(false);
    }
  }

  const fieldErrors: FieldError[] = localError?.fieldErrors ?? [];
  const errorsFor = (field: string) => fieldErrors.filter((e) => e.field === field);

  return (
    <section className="cm-panel">
      <header className="cm-panel-head">
        <h2>基本信息</h2>
        <span className="cm-muted">配置版本 v{activity.configVersion}</span>
      </header>

      <ErrorBanner error={localError} onDismiss={() => setLocalError(null)} />

      <div className="cm-grid">
        <label className="cm-field cm-span-2">
          <span>活动名称</span>
          <input
            value={form.title}
            disabled={!canEditTitle}
            maxLength={120}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <FieldErrorText errors={errorsFor("title")} />
        </label>

        <label className="cm-field cm-span-2">
          <span>活动说明</span>
          <textarea
            value={form.description}
            disabled={!canEditDescription}
            rows={3}
            maxLength={2000}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <FieldErrorText errors={errorsFor("description")} />
        </label>

        <label className="cm-field">
          <span>开始时间</span>
          <input
            type="datetime-local"
            value={form.startAt}
            disabled={!canEditTitle}
            onChange={(e) => setForm({ ...form, startAt: e.target.value })}
          />
          <FieldErrorText errors={errorsFor("startAt")} />
        </label>

        <label className="cm-field">
          <span>截止时间</span>
          <input
            type="datetime-local"
            value={form.deadlineAt}
            disabled={!canEditTitle}
            onChange={(e) => setForm({ ...form, deadlineAt: e.target.value })}
          />
          <FieldErrorText errors={errorsFor("deadlineAt")} />
        </label>

        <label className="cm-field">
          <span>最大志愿数（1～3）</span>
          <select
            value={form.maxPreferences}
            disabled={!canEditTitle}
            onChange={(e) => setForm({ ...form, maxPreferences: e.target.value })}
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
          <FieldErrorText errors={errorsFor("maxPreferences")} />
        </label>
      </div>

      <div className="cm-actions">
        <button type="button" onClick={handleSave} disabled={!hasChange || saving}>
          {saving ? "保存中…" : "保存基本信息"}
        </button>
        {hasChange && !saving && <span className="cm-muted">有未保存的改动</span>}
        {!canEditTitle && canEditDescription && (
          <span className="cm-muted">活动已发布，仅活动说明可修改</span>
        )}
        {!canEditTitle && !canEditDescription && (
          <span className="cm-muted">当前状态不可修改配置</span>
        )}
      </div>
    </section>
  );
}
