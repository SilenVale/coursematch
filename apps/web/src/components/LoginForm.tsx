import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ActorView } from "@coursematch/shared";
import { apiLogin } from "../api/client";
import { DEMO_ACCOUNTS } from "../demoAccounts";

export function LoginForm({
  onLogin,
  compact = false,
  showTitle = false,
}: {
  onLogin: (a: ActorView) => void;
  compact?: boolean;
  showTitle?: boolean;
}) {
  const [searchParams] = useSearchParams();
  const prefill = searchParams.get("prefill") ?? "";
  const [identifier, setIdentifier] = useState(prefill || "teacher_blank");
  const [password, setPassword] = useState("Coursematch-Dev-2026");
  const [error, setError] = useState("");
  useEffect(() => {
    if (prefill) setIdentifier(prefill);
  }, [prefill]);

  return (
    <div className={`login-form${compact ? " login-form--compact" : ""}`}>
      {(showTitle || !compact) && (
        <h2 className="login-form-title" id="landing-login-title">
          登录系统
        </h2>
      )}
      <div className="login-quick">
        {DEMO_ACCOUNTS.map((row) => (
          <button
            key={row.id}
            type="button"
            className="btn btn-sm"
            onClick={() => setIdentifier(row.id)}
          >
            {row.title}（{row.hint}）
          </button>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const next = await apiLogin(identifier, password);
            onLogin(next);
          } catch (err) {
            setError(err instanceof Error ? err.message : "登录失败");
          }
        }}
      >
        <div className="field">
          <label className="label-inline" htmlFor="login-id">
            账号
          </label>
          <input
            id="login-id"
            className="input"
            style={{ width: "100%" }}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="teacher_blank / 学号"
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label className="label-inline" htmlFor="login-pw">
            密码
          </label>
          <input
            id="login-pw"
            className="input"
            style={{ width: "100%" }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            autoComplete="current-password"
          />
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
          登录
        </button>
      </form>
      {error && (
        <p className="error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
      <p className="text-muted" style={{ marginTop: 12, fontSize: 13 }}>
        本地演示默认密码见 README（Coursematch-Dev-2026）。
      </p>
    </div>
  );
}
