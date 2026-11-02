import { Link, useSearchParams } from "react-router-dom";
import type { ActorView } from "@coursematch/shared";
import { LoginForm } from "../components/LoginForm";

/** 独立登录页（原 Login 表单），不叠在落地页上。 */
export function LoginPage({ onLogin }: { onLogin: (a: ActorView) => void }) {
  const [searchParams] = useSearchParams();
  const fromSwitch = Boolean(searchParams.get("prefill"));

  return (
    <div className="login-screen">
      <div className="login-card card">
        {fromSwitch ? (
          <p className="text-muted" style={{ marginBottom: 16, fontSize: 13 }}>
            已退出当前账号，请登录目标演示账号。
          </p>
        ) : (
          <p className="text-muted" style={{ marginBottom: 16, fontSize: 13 }}>
            <Link to="/">← 返回首页</Link>
          </p>
        )}
        <LoginForm
          onLogin={(a) => {
            onLogin(a);
          }}
          showTitle
        />
      </div>
    </div>
  );
}
