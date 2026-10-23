import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ActorView } from "@coursematch/shared";
import { apiLogin } from "../api/client";

const QUICK_ACCOUNTS = [
  { id: "teacher_blank", label: "空教师" },
  { id: "teacher_ready", label: "已配置教师" },
  { id: "20260001", label: "学生甲" },
] as const;

export function LoginPage({ onLogin }: { onLogin: (a: ActorView) => void }) {
  const [searchParams] = useSearchParams();
  const prefill = searchParams.get("prefill") ?? "";
  const [identifier, setIdentifier] = useState(prefill || "teacher_blank");
  const [password, setPassword] = useState("Coursematch-Dev-2026");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (prefill) setIdentifier(prefill);
  }, [prefill]);

  return (
    <div className="login-screen">
      <div className="card login-card">
        <h1 className="page-head">登录 CourseMatch</h1>
        <p className="lead">选课系统：教师配置发布，学生填报志愿，截止后统一分配。</p>
        <div className="login-quick">
          {QUICK_ACCOUNTS.map((row) => (
            <button
              key={row.id}
              type="button"
              className="btn btn-sm"
              onClick={() => setIdentifier(row.id)}
            >
              {row.label}
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
              navigate("/");
            } catch (err) {
              setError(err instanceof Error ? err.message : "登录失败");
            }
          }}
        >
          <div className="field">
            <label className="label-inline" htmlFor="login-id">账号</label>
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
            <label className="label-inline" htmlFor="login-pw">密码</label>
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
        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
        <p className="text-muted" style={{ marginTop: 12, fontSize: 13 }}>
          演示密码见 README。切换账号会退出当前会话后在登录页预填。
        </p>
      </div>
    </div>
  );
}
