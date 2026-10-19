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
    <div className="card">
      <h1>登录</h1>
      <p>种子账号见仓库 README。</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const actor = await apiLogin(identifier, password);
            onLogin(actor);
            navigate("/");
          } catch (err) {
            setError(err instanceof Error ? err.message : "登录失败");
          }
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="账号"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
          />
        </div>
        <button type="submit">登录</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
