import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";

interface AssistantTopic {
  courseName: string;
  instructor: string;
  schedule: string;
  capacity: number | null;
}

interface AssistantDraft {
  activityId: string | null;
  configVersion: number | null;
  lifecycle: "NONE" | "DRAFT" | "PUBLISHED" | "ALLOCATED";
  title: string;
  description: string;
  startAt: string | null;
  deadlineAt: string | null;
  maxPreferences: number | null;
  rosterText: string;
  rosterWritten: boolean;
  topic: AssistantTopic;
  topicWritten: boolean;
  pending: "create" | "publish" | "provision" | "freeze" | "allocate" | null;
  awaiting?: string | null;
}

interface ConfirmCard {
  action: string;
  summary: string[];
}

interface TurnView {
  draft: AssistantDraft;
  reply: string;
  confirm: ConfirmCard | null;
}

const ACTION_LABEL: Record<string, string> = {
  create: "确认创建",
  publish: "确认发布",
  provision: "确认开通账号",
  freeze: "确认冻结",
  allocate: "确认主分配",
};

const KEY_STORAGE = "coursematch.deepseek.apiKey";

function readStoredKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE)?.trim() ?? "";
  } catch {
    return "";
  }
}

async function fetchLlmStatus(): Promise<{ llmReady: boolean; llmSource: "server" | "browser" | "none" }> {
  const res = await fetch("/api/assistant/llm-status", {
    credentials: "include",
    headers: { "X-CourseMatch-Request": "1" },
  });
  const body = (await res.json()) as {
    data?: { llmReady: boolean; llmSource: "server" | "browser" | "none" };
  };
  if (!res.ok || !body.data) return { llmReady: false, llmSource: "none" };
  return body.data;
}

async function postTurn(
  message: string,
  draft: AssistantDraft | null,
  history: { role: "teacher" | "assistant"; text: string }[],
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
  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [lines, setLines] = useState<{ role: "teacher" | "assistant"; text: string }[]>([
    {
      role: "assistant",
      text: "把这场选课说清楚就行。\n需要名称、截止时间、名单和一门课。\n缺的我会逐项问。\n确认之后才会写入。",
    },
  ]);
  const [confirm, setConfirm] = useState<ConfirmCard | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState(readStoredKey);
  const [serverLlm, setServerLlm] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
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
      if (!fromServer && !readStoredKey()) setKeyOpen(true);
    });
  }, []);

  const llmReady = serverLlm || !!apiKey;

  function resizeInput(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function saveKey(event: FormEvent) {
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

  async function send(message: string, shown?: string) {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    if (!llmReady) {
      setKeyOpen(true);
      return;
    }
    setBusy(true);
    setError("");
    setLines((prev) => [...prev, { role: "teacher", text: shown ?? trimmed }]);
    setText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    let turn: TurnView | null = null;
    try {
      turn = await postTurn(trimmed, draft, lines.slice(-8), apiKey);
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
      {keyOpen && (
        <div className="assistant-key" role="dialog" aria-modal="true" aria-labelledby="assistant-key-title">
          <form className="assistant-key-card" onSubmit={saveKey}>
            <h2 id="assistant-key-title">接入 DeepSeek</h2>
            <p>
              {serverLlm
                ? "站点已在服务端配置模型。这里填的密钥仅在本机覆盖，一般不用改。创建和发布仍要确认后才会写入。"
                : "密钥只保存在这台浏览器里，用来听懂你说的话。创建和发布仍要确认后才会写入。"}
            </p>
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
            <div className="assistant-key-actions">
              {apiKey && (
                <button type="button" onClick={() => setKeyOpen(false)}>
                  稍后
                </button>
              )}
              <button type="submit" disabled={!keyDraft.trim()}>
                保存
              </button>
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
            onClick={() => !serverLlm && setKeyOpen(true)}
            disabled={serverLlm}
          >
            {serverLlm ? "DeepSeek 由站点提供" : apiKey ? "DeepSeek 已接入" : "填写 DeepSeek 密钥"}
          </button>
          <span className="assistant-hint">Enter 发送，Shift+Enter 换行</span>
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
