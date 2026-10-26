import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { apiMe } from "../../api/client";
import {
  clearTeacherAssistantSession,
  fetchTeacherAssistantSession,
  saveTeacherAssistantSession,
} from "./assistantSessionApi";
import {
  ASSISTANT_WELCOME,
  assistantSessionHasProgress,
  clearAssistantSession,
  freshAssistantSession,
  saveAssistantSession,
  type AssistantDraft,
  type ChatLine,
  type ConfirmCard,
} from "./assistantSessionStorage";

interface TurnView {
  draft: AssistantDraft;
  reply: string;
  confirm: ConfirmCard | null;
}

const ACTION_LABEL: Record<string, string> = {
  create: "确认创建",
  add_topic: "确认添加课程",
  publish: "确认发布",
  provision: "确认开通账号",
  freeze: "确认冻结",
  allocate: "确认主分配",
};

const KEY_STORAGE = "coursematch.deepseek.apiKey";
const DEFAULT_LLM_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_LLM_MODEL = "deepseek-flash";

function readStoredKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE)?.trim() ?? "";
  } catch {
    return "";
  }
}

type LlmStatus = {
  llmReady: boolean;
  llmSource: "server" | "browser" | "none";
  serverKeyStore: "env" | "db" | "file" | "none";
};

async function fetchLlmStatus(): Promise<LlmStatus> {
  const res = await fetch("/api/assistant/llm-status", {
    credentials: "include",
    headers: { "X-CourseMatch-Request": "1" },
  });
  const body = (await res.json()) as { data?: LlmStatus };
  if (!res.ok || !body.data) return { llmReady: false, llmSource: "none", serverKeyStore: "none" };
  return body.data;
}

async function saveServerLlm(input: { apiKey: string; apiUrl: string; model: string }): Promise<LlmStatus> {
  const res = await fetch("/api/assistant/llm-config", {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CourseMatch-Request": "1",
    },
    body: JSON.stringify({
      apiKey: input.apiKey,
      apiUrl: input.apiUrl.trim() || DEFAULT_LLM_URL,
      model: input.model.trim() || DEFAULT_LLM_MODEL,
    }),
  });
  const body = (await res.json()) as { data?: LlmStatus; error?: { message?: string } };
  if (!res.ok || !body.data) {
    throw new Error(body.error?.message ?? "站点密钥没有保存成功");
  }
  return body.data;
}

async function postTurn(
  message: string,
  draft: AssistantDraft | null,
  history: ChatLine[],
  browserKey: string,
): Promise<TurnView> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-CourseMatch-Request": "1",
  };
  if (browserKey) headers["X-CourseMatch-Model-Key"] = browserKey;
  const res = await fetch("/api/assistant/turns", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ message, draft, history }),
  });
  const body = (await res.json()) as { data?: TurnView; error?: { message?: string } };
  if (!res.ok || !body.data) {
    throw new Error(body.error?.message ?? "助理没有回应");
  }
  return body.data;
}

export function TeacherAssistantPage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const skipPersistRef = useRef(true);
  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([ASSISTANT_WELCOME]);
  const [confirm, setConfirm] = useState<ConfirmCard | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState(readStoredKey);
  const [serverLlm, setServerLlm] = useState(false);
  const [serverKeyStore, setServerKeyStore] = useState<LlmStatus["serverKeyStore"]>("none");
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyMode, setKeyMode] = useState<"server" | "browser">("server");
  const [keyDraft, setKeyDraft] = useState("");
  const [serverUrlDraft, setServerUrlDraft] = useState(DEFAULT_LLM_URL);
  const [serverModelDraft, setServerModelDraft] = useState(DEFAULT_LLM_MODEL);
  const [keySaving, setKeySaving] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
  }, [lines, confirm, busy, error]);

  useEffect(() => {
    if (confirm) confirmBtnRef.current?.focus();
  }, [confirm]);

  useEffect(() => {
    void fetchLlmStatus().then((status) => {
      const fromServer = status.llmSource === "server" && status.llmReady;
      setServerLlm(fromServer);
      setServerKeyStore(status.serverKeyStore);
    });
  }, []);

  useEffect(() => {
    void apiMe().then(async (actor) => {
      if (!actor?.accountId) {
        setSessionReady(true);
        skipPersistRef.current = false;
        return;
      }
      setAccountId(actor.accountId);
      try {
        const saved = await fetchTeacherAssistantSession();
        if (saved) {
          setDraft(saved.draft);
          setLines(saved.lines);
          setConfirm(saved.confirm);
          saveAssistantSession(actor.accountId, {
            draft: saved.draft,
            lines: saved.lines,
            confirm: saved.confirm,
          });
        }
      } catch {
        setError("没有从服务器恢复会话，仍可继续对话");
      }
      setSessionReady(true);
      skipPersistRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (!sessionReady || !accountId || skipPersistRef.current) return;
    const payload = { draft, lines, confirm };
    saveAssistantSession(accountId, payload);
    const timer = window.setTimeout(() => {
      void saveTeacherAssistantSession({ v: 1, ...payload }).catch(() => {
        /* 离线时仍保留本浏览器副本 */
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [accountId, confirm, draft, lines, sessionReady]);

  const sessionBusy = busy || restarting;
  const hasProgress = assistantSessionHasProgress({ draft, lines, confirm });

  async function applySessionRestart() {
    if (sessionBusy) return;
    setRestarting(true);
    setError("");
    skipPersistRef.current = true;
    const fresh = freshAssistantSession();
    try {
      if (accountId) {
        clearAssistantSession(accountId);
        await clearTeacherAssistantSession();
        saveAssistantSession(accountId, fresh);
        await saveTeacherAssistantSession({ v: 1, ...fresh });
      }
      setDraft(fresh.draft);
      setLines(fresh.lines);
      setConfirm(fresh.confirm);
      setText("");
      setRestartOpen(false);
      inputRef.current?.focus();
    } catch {
      setError("会话没有清空成功，请稍后再试");
    } finally {
      skipPersistRef.current = false;
      setRestarting(false);
    }
  }

  function requestSessionRestart() {
    if (sessionBusy) return;
    if (hasProgress) {
      setRestartOpen(true);
      return;
    }
    void applySessionRestart();
  }

  const llmReady = serverLlm || !!apiKey;

  function resizeInput(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function saveBrowserKey(event: FormEvent) {
    event.preventDefault();
    const next = keyDraft.trim();
    if (!next) return;
    try {
      localStorage.setItem(KEY_STORAGE, next);
    } catch {
      setError("这台浏览器没有存下密钥");
      return;
    }
    setApiKey(next);
    setKeyDraft("");
    setKeyOpen(false);
  }

  async function saveServerKey(event: FormEvent) {
    event.preventDefault();
    const next = keyDraft.trim();
    if (!next) return;
    setKeySaving(true);
    setError("");
    try {
      const status = await saveServerLlm({
        apiKey: next,
        apiUrl: serverUrlDraft,
        model: serverModelDraft,
      });
      setServerLlm(status.llmReady && status.llmSource === "server");
      setServerKeyStore(status.serverKeyStore);
      setKeyDraft("");
      setKeyOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "站点密钥没有保存成功");
    } finally {
      setKeySaving(false);
    }
  }

  async function send(message: string, shown?: string) {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError("");
    const teacherLine: ChatLine = { role: "teacher", text: shown ?? trimmed };
    const historyForTurn = [...lines, teacherLine].slice(-8);
    setLines((prev) => [...prev, teacherLine]);
    setText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    let turn: TurnView | null = null;
    try {
      turn = await postTurn(trimmed, draft, historyForTurn, apiKey);
      setDraft(turn.draft);
      setConfirm(turn.confirm);
      setLines((prev) => [...prev, { role: "assistant", text: turn!.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setBusy(false);
      if (!turn?.confirm) inputRef.current?.focus();
    }
  }

  async function onRosterFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const csv = (await file.text()).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!csv) {
      setError("这个 CSV 是空的");
      return;
    }
    const rows = csv.split("\n").filter((line) => line.trim()).length;
    await send(csv, `导入名单：${file.name}（${rows} 行）`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send(text);
  }

  return (
    <div className="assistant">
      <header className="assistant-toolbar">
        <p className="assistant-toolbar-title">选课助理</p>
        <button
          type="button"
          className="assistant-restart"
          disabled={sessionBusy}
          aria-haspopup={hasProgress ? "dialog" : undefined}
          onClick={requestSessionRestart}
        >
          重启会话
        </button>
      </header>
      {restartOpen && (
        <div className="assistant-key" role="dialog" aria-modal="true" aria-labelledby="assistant-restart-title">
          <div className="assistant-key-card">
            <h2 id="assistant-restart-title">重启会话？</h2>
            <p>
              将清空当前聊天记录和助理草稿（未确认的操作也会取消）。<strong>不会删除</strong>
              已在「我的课程」里创建的活动，只是从这里重新开始一场新的对话。
            </p>
            <div className="assistant-key-actions">
              <button type="button" className="assistant-dialog-secondary" disabled={restarting} onClick={() => setRestartOpen(false)}>
                取消
              </button>
              <button type="button" disabled={restarting} onClick={() => void applySessionRestart()}>
                {restarting ? "正在清空…" : "确认重启"}
              </button>
            </div>
          </div>
        </div>
      )}
      {keyOpen && (
        <div className="assistant-key" role="dialog" aria-modal="true" aria-labelledby="assistant-key-title">
          <form
            className="assistant-key-card"
            onSubmit={(event) => {
              if (keyMode === "server") void saveServerKey(event);
              else saveBrowserKey(event);
            }}
          >
            <h2 id="assistant-key-title">配置 DeepSeek</h2>
            <p>
              请在这里填写，<strong>不要</strong>在 Cursor 或其它聊天里粘贴 API Key。保存后只有服务端会使用，页面和对话里都不会回显密钥。
            </p>
            <div className="assistant-key-tabs">
              <button
                type="button"
                className={keyMode === "server" ? "active" : ""}
                onClick={() => setKeyMode("server")}
              >
                全站共用（推荐）
              </button>
              <button
                type="button"
                className={keyMode === "browser" ? "active" : ""}
                onClick={() => setKeyMode("browser")}
                disabled={serverLlm && serverKeyStore === "env"}
              >
                仅本浏览器
              </button>
            </div>
            {keyMode === "server" ? (
              <>
                {serverKeyStore === "env" ? (
                  <p className="assistant-key-note">已在部署环境变量中配置，如需更换请到 Render / 服务器环境变量里改。</p>
                ) : (
                  <>
                    <label>
                      API Key
                      <input
                        type="password"
                        autoFocus
                        autoComplete="off"
                        value={keyDraft}
                        placeholder="sk-..."
                        onChange={(event) => setKeyDraft(event.target.value)}
                      />
                    </label>
                    <label>
                      API 地址（可选，自建代理时填写）
                      <input
                        type="url"
                        autoComplete="off"
                        value={serverUrlDraft}
                        placeholder="https://api.deepseek.com/chat/completions"
                        onChange={(event) => setServerUrlDraft(event.target.value)}
                      />
                    </label>
                    <label>
                      模型（可选）
                      <input
                        value={serverModelDraft}
                        placeholder={DEFAULT_LLM_MODEL}
                        onChange={(event) => setServerModelDraft(event.target.value)}
                      />
                    </label>
                    <p className="assistant-key-note">
                      保存后会试连一次，密钥写入站点数据库（不进 Git、不回显）。全站教师共用，Render 重启后仍会自动加载；若已在环境变量配置
                      DEEPSEEK_API_KEY 则无需在此填写。
                    </p>
                  </>
                )}
              </>
            ) : (
              <label>
                API Key（仅本机）
                <input
                  type="password"
                  autoComplete="off"
                  value={keyDraft}
                  placeholder="sk-..."
                  onChange={(event) => setKeyDraft(event.target.value)}
                />
              </label>
            )}
            <div className="assistant-key-actions">
              {(llmReady || keyDraft) && (
                <button type="button" onClick={() => setKeyOpen(false)}>
                  稍后
                </button>
              )}
              {!(keyMode === "server" && serverKeyStore === "env") && (
                <button type="submit" disabled={!keyDraft.trim() || keySaving}>
                  {keySaving ? "正在验证…" : keyMode === "server" ? "保存到站点" : "保存到本机"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
      <div className="assistant-thread" ref={threadRef} aria-live="polite">
        {draft?.activityId && (
          <p className="assistant-meta">
            <Link to={`/teacher/courses/${draft.activityId}/configure`}>打开课程设置</Link>
          </p>
        )}
        {lines.map((line, index) => (
          <p key={index} className={`assistant-msg assistant-msg-${line.role}`}>
            {line.text}
          </p>
        ))}
        {confirm && (
          <div className="assistant-confirm">
            <ul>
              {confirm.summary.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <button
              ref={confirmBtnRef}
              type="button"
              className="assistant-confirm-btn"
              disabled={busy}
              onClick={() => send("确认")}
            >
              {ACTION_LABEL[confirm.action] ?? "确认"}
            </button>
          </div>
        )}
        {busy && (
          <p className="assistant-pending" aria-label="正在整理">
            <span />
            <span />
            <span />
          </p>
        )}
      </div>
      {!llmReady && !keyOpen && (
        <p className="assistant-key-note assistant-llm-hint">
          当前为规则助理模式；需要 DeepSeek 时点「接入 DeepSeek（可选）」，或由管理员在 Render 配置 DEEPSEEK_API_KEY。
        </p>
      )}
      {error && <p className="assistant-error">{error}</p>}
      <form
        className="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send(text);
        }}
      >
        <textarea
          ref={inputRef}
          className="assistant-composer-input"
          value={text}
          rows={1}
          aria-label="跟助理说"
          placeholder={confirm ? "补充缺的一项" : "描述这场选课，或补充缺的一项"}
          onChange={(event) => {
            setText(event.target.value);
            resizeInput(event.target);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="assistant-composer-bar">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => void onRosterFile(event)}
          />
          <button
            type="button"
            className="assistant-plus"
            aria-label="导入名单 CSV"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 1.5V12.5M1.5 7H12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="assistant-key-open"
            onClick={() => {
              setKeyMode(serverLlm ? "browser" : "server");
              setKeyOpen(true);
            }}
          >
            {serverLlm ? "DeepSeek 由站点提供" : apiKey ? "DeepSeek 已接入" : "接入 DeepSeek（可选）"}
          </button>
          <span className="assistant-hint">对话按账号保存在服务器 · Enter 发送</span>
          <button type="submit" className="assistant-send" disabled={busy || !text.trim()} aria-label="发送">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
