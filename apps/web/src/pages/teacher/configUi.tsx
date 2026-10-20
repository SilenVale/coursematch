/**
 * 石俊贤 · M2 教师端共用的小组件与格式化函数。
 */
import type { ReactNode } from "react";
import type { ActivityPhase, FieldError, Lifecycle, RowError } from "@coursematch/shared";
import { ApiError } from "./configApi";

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  ALLOCATED: "已分配",
  CLOSED: "已关闭",
  VOID: "已作废",
};

export const PHASE_LABEL: Record<ActivityPhase, string> = {
  DRAFT: "草稿",
  NOT_STARTED: "未开始",
  FILLING: "填报中",
  DEADLINE_REACHED: "已截止",
  ALLOCATED: "分配完成",
  CLOSED: "已关闭",
  VOID: "已作废",
};

/** 契约里时间是带时区的 ISO；页面统一按北京时间显示。 */
export function formatBeijing(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** ISO → `<input type="datetime-local">` 需要的本地值。 */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** `datetime-local` 的值 → 带时区的 ISO。 */
export function fromDateTimeLocal(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

/** 把任意异常转成可展示的 ApiError 形状。 */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError({
    status: 0,
    code: "INTERNAL_ERROR",
    message: err instanceof Error ? err.message : "请求失败",
  });
}

export function ErrorBanner({
  error,
  onDismiss,
}: {
  error: ApiError | null;
  onDismiss?: () => void;
}) {
  if (!error) return null;
  return (
    <div className="cm-error" role="alert">
      <div className="cm-error-head">
        <strong>{error.code}</strong>
        <span>{error.message}</span>
        {onDismiss && (
          <button type="button" className="cm-link" onClick={onDismiss}>
            关闭
          </button>
        )}
      </div>
      {error.fieldErrors.length > 0 && (
        <ul className="cm-error-list">
          {error.fieldErrors.map((e, i) => (
            <li key={`${e.field}-${i}`}>
              <code>{e.field}</code> {e.message}
            </li>
          ))}
        </ul>
      )}
      {error.rowErrors.length > 0 && <RowErrorTable rows={error.rowErrors} />}
    </div>
  );
}

/** CSV 导入失败时逐行列出原因；行数多时只显示前 20 行。 */
export function RowErrorTable({ rows }: { rows: RowError[] }) {
  const shown = rows.slice(0, 20);
  return (
    <div className="cm-row-errors">
      <table>
        <thead>
          <tr>
            <th>行号</th>
            <th>字段</th>
            <th>原因</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={`${r.rowNumber}-${r.field}-${i}`}>
              <td>{r.rowNumber}</td>
              <td>
                <code>{r.field}</code>
              </td>
              <td>{r.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <p className="cm-muted">另有 {rows.length - shown.length} 行未显示。</p>
      )}
    </div>
  );
}

export function FieldErrorText({ errors }: { errors: FieldError[] }) {
  if (errors.length === 0) return null;
  return <p className="cm-field-error">{errors.map((e) => e.message).join("；")}</p>;
}

export function Badge({
  tone,
  children,
}: {
  tone: "draft" | "published" | "warn" | "ok" | "muted";
  children: ReactNode;
}) {
  return <span className={`cm-badge cm-badge-${tone}`}>{children}</span>;
}
