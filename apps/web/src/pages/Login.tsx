import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ActorView } from "@coursematch/shared";
import { apiLogin } from "../api/client";

export function LoginPage({ onLogin }: { onLogin: (a: ActorView) => void }) {
  const [identifier, setIdentifier] = useState("teacher01");
  const [password, setPassword] = useState("Coursematch-Dev-2026");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  return (
    <div className="login-screen">
      <div className="card login-card">
        <h1 className="page-head">登录 CourseMatch</h1>
        <p className="lead">预置账号见仓库 README。登录后进入教师或学生工作台。</p>
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
              placeholder="teacher01 或学号"
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
      </div>
    </div>
  );
}
