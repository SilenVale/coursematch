/**
 * 石俊贤 · M2 名单面板：五列 CSV 的「选文件 → 预览 → 确认整份替换」。
 *
 * 关键交互约束（对应任务卡验收项）：
 * - 预览不写库，只有点「确认替换」才调用 PUT；
 * - 预览失败时逐行列出原因，已生效名单保持不动；
 * - 版本冲突（VERSION_CONFLICT）提示刷新，不自动覆盖。
 */
import { useCallback, useEffect, useState } from "react";
import type { ParticipantQuery, ParticipantView, RosterPreview } from "@coursematch/shared";
import {
  ApiError,
  listParticipants,
  previewRoster,
  provisionParticipantAccounts,
  replaceRoster,
} from "./configApi";
import { Badge, ErrorBanner, formatBeijing, toApiError } from "./configUi";

export function RosterPanel({
  activityId,
  configVersion,
  editable,
  onVersionChange,
  onChanged,
}: {
  activityId: string;
  configVersion: number;
  editable: boolean;
  onVersionChange: (configVersion: number) => void;
  onChanged: () => void;
}) {
  const [participants, setParticipants] = useState<ParticipantView[]>([]);
  const [filters, setFilters] = useState<ParticipantQuery>({});
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<ApiError | null>(null);

  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "replace" | "provision" | null>(null);
  const [importError, setImportError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await listParticipants(activityId, filters);
      setParticipants(res.items);
    } catch (err) {
      setListError(toApiError(err));
    } finally {
      setLoadingList(false);
    }
  }, [activityId, filters]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    setImportError(null);
    setNotice("");
    const text = await file.text();
    setCsvText(text);
  }

  async function handlePreview() {
    if (!csvText.trim()) {
      setImportError(
        new ApiError({
          status: 0,
          code: "INVALID_INPUT",
          message: "请先选择 CSV 文件，或把名单内容粘贴到下方文本框",
        }),
      );
      return;
    }
    setBusy("preview");
    setImportError(null);
    setNotice("");
    try {
      const result = await previewRoster(activityId, csvText, configVersion);
      setPreview(result);
    } catch (err) {
      const apiError = toApiError(err);
      setPreview(null);
      setImportError(apiError);
    } finally {
      setBusy(null);
    }
  }

  async function handleReplace() {
    if (!preview) return;
    setBusy("replace");
    setImportError(null);
    try {
      const result = await replaceRoster(activityId, csvText, configVersion);
      setPreview(null);
      setCsvText("");
      setFileName("");
      setNotice(
        `名单已整份替换：当前 ${result.participantCount} 人，配置版本升至 v${result.configVersion}`,
      );
      onVersionChange(result.configVersion);
      onChanged();
      await loadList();
    } catch (err) {
      const apiError = toApiError(err);
      setImportError(apiError);
      // 版本冲突时旧预览已失效，要求重新预览。
      if (apiError.code === "VERSION_CONFLICT") setPreview(null);
    } finally {
      setBusy(null);
    }
  }

  const accountsReady = participants.filter((p) => p.accountConfigured).length;
  const accountsPending = participants.length - accountsReady;

  async function handleProvisionAccounts() {
    setBusy("provision");
    setImportError(null);
    setNotice("");
    try {
      const result = await provisionParticipantAccounts(activityId);
      setNotice(
        result.provisionedCount > 0
          ? `已为 ${result.provisionedCount} 人开通账号（学号登录，初始密码 ${result.defaultPasswordHint}）：${result.identifiers.join("、")}`
          : "名单中的学生均已开通账号，无需操作。",
      );
      await loadList();
    } catch (err) {
      setImportError(toApiError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="cm-panel">
      <header className="cm-panel-head">
        <h2>参与名单</h2>
        <span className="cm-muted">
          {loadingList ? "加载中…" : `共 ${participants.length} 人，其中 ${accountsReady} 人已开通账号`}
        </span>
      </header>

      {accountsPending > 0 && (
        <div className="cm-actions" style={{ marginBottom: 12 }}>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleProvisionAccounts()}
          >
            {busy === "provision" ? "开通中…" : `为 ${accountsPending} 名未开通学生创建登录账号`}
          </button>
          <span className="cm-muted">账号为学号，初始密码见 README。</span>
        </div>
      )}

      <ErrorBanner error={listError} onDismiss={() => setListError(null)} />

      {!editable && (
        <p className="cm-hint">
          活动已不是草稿状态，名单只能查看、不能替换（服务端返回 <code>CONFIG_LOCKED</code>）。
        </p>
      )}

      {editable && (
        <div className="cm-roster-import">
          <h3>导入新名单（整份替换）</h3>
          <p className="cm-muted">
            固定五列：<code>学号,姓名,入学年,专业,班级</code>。首行可以是表头。
            先预览确认，再执行替换；导入失败不会影响当前已生效的名单。
          </p>

          <div className="cm-actions">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            {fileName && <span className="cm-muted">已选择：{fileName}</span>}
          </div>

          <label className="cm-field">
            <span>或直接粘贴 CSV 内容</span>
            <textarea
              rows={5}
              value={csvText}
              placeholder={"学号,姓名,入学年,专业,班级\n20260001,张三,2026,软件工程,1班"}
              onChange={(e) => {
                setCsvText(e.target.value);
                setPreview(null);
              }}
            />
          </label>

          <div className="cm-actions">
            <button type="button" onClick={handlePreview} disabled={busy !== null}>
              {busy === "preview" ? "预览中…" : "预览名单"}
            </button>
            <button
              type="button"
              onClick={handleReplace}
              disabled={!preview || busy !== null}
            >
              {busy === "replace" ? "替换中…" : "确认替换"}
            </button>
          </div>

          <ErrorBanner error={importError} onDismiss={() => setImportError(null)} />
          {notice && <p className="cm-notice">{notice}</p>}

          {preview && (
            <div className="cm-preview">
              <h4>预览结果（尚未写入）</h4>
              <div className="cm-preview-stats">
                <span>
                  <Badge tone="ok">新增 {preview.addedCount}</Badge>
                </span>
                <span>
                  <Badge tone="muted">保留 {preview.retainedCount}</Badge>
                </span>
                <span>
                  <Badge tone={preview.removedCount > 0 ? "warn" : "muted"}>
                    移除 {preview.removedCount}
                  </Badge>
                </span>
              </div>
              <div className="cm-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>行号</th>
                      <th>学号</th>
                      <th>姓名</th>
                      <th>入学年</th>
                      <th>专业</th>
                      <th>班级</th>
                      <th>变化</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={`${row.rowNumber}-${row.studentNumber}`}>
                        <td>{row.rowNumber}</td>
                        <td>{row.studentNumber}</td>
                        <td>{row.name}</td>
                        <td>{row.enrollmentYear}</td>
                        <td>{row.major}</td>
                        <td>{row.className}</td>
                        <td>
                          <Badge tone={row.change === "ADDED" ? "ok" : "muted"}>
                            {row.change === "ADDED" ? "新增" : "保留"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.removedCount > 0 && (
                <p className="cm-hint">
                  替换后会有 {preview.removedCount} 人从名单中移除。若这些学生已提交志愿，
                  其志愿记录不会随名单删除而消失，请确认后再执行。
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <h3>当前名单</h3>
      <div className="cm-filters">
        <input
          placeholder="搜索学号或姓名"
          value={filters.q ?? ""}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
        <input
          placeholder="入学年"
          value={filters.enrollmentYear ?? ""}
          onChange={(e) => setFilters({ ...filters, enrollmentYear: e.target.value })}
        />
        <input
          placeholder="专业"
          value={filters.major ?? ""}
          onChange={(e) => setFilters({ ...filters, major: e.target.value })}
        />
        <input
          placeholder="班级"
          value={filters.className ?? ""}
          onChange={(e) => setFilters({ ...filters, className: e.target.value })}
        />
        <button type="button" onClick={() => void loadList()} disabled={loadingList}>
          刷新
        </button>
      </div>

      {participants.length === 0 && !loadingList ? (
        <p className="cm-empty">名单为空。导入 CSV 后学生才能看到并选择本活动的题目。</p>
      ) : (
        <div className="cm-table-wrap">
          <table>
            <thead>
              <tr>
                <th>学号</th>
                <th>姓名</th>
                <th>入学年</th>
                <th>专业</th>
                <th>班级</th>
                <th>资格</th>
                <th>账号</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.participantId}>
                  <td>{p.studentNumber}</td>
                  <td>{p.name}</td>
                  <td>{p.enrollmentYear}</td>
                  <td>{p.major}</td>
                  <td>{p.className}</td>
                  <td>
                    <Badge tone={p.eligible ? "ok" : "warn"}>
                      {p.eligible ? "合格" : "不合格"}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={p.accountConfigured ? "ok" : "warn"}>
                      {p.accountConfigured ? "已开通" : "未开通"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="cm-muted">
        名单变更时间以服务端为准，最近一次刷新：{formatBeijing(new Date().toISOString())}
      </p>
    </section>
  );
}
