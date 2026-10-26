# Dev 环境部署（Render，替代 Zeabur）

> **为什么不用 Zeabur：** 团队反馈 Zeabur 运营/可用性不稳定；本仓库采用 **Render**（HTTPS + 免费档 Postgres + Docker），流程类似，无需改业务代码。

## 架构

- **单 Web 服务（Docker）**：`npm run build` 后的 API + `apps/web/dist` 同域提供（Cookie 会话无需跨域）。
- **Render PostgreSQL**：`DATABASE_URL` 由 Blueprint 自动注入。
- **健康检查**：`GET /api/health`

## 一键创建（推荐）

1. 登录 [Render](https://render.com/)（GitHub 授权）。
2. **New → Blueprint**，选择 `SilenVale/coursematch` 仓库与 `master`（或本 PR 分支）。
3. 确认 `render.yaml` 解析出 **coursematch-dev** + **coursematch-db**。
4. 在 Web 服务环境变量中设置 **`WEB_ORIGIN`** = 部署完成后的公网 URL（形如 `https://coursematch-dev-xxxx.onrender.com`）。  
   （若未手设，可依赖 `RENDER_EXTERNAL_URL`；建议仍显式设 `WEB_ORIGIN` 与公网 URL 一致。）
5. 首次部署完成后访问公网 URL，使用 README 种子账号登录。

**区域：** 免费档 Postgres 默认在 **Oregon**；Web 服务须与数据库 **同区域**（`render.yaml` 中均为 `oregon`），否则 Blueprint 注入的内网 `DATABASE_URL` 会 `ENOTFOUND`。若 Web 误建在 Singapore，可在环境变量中改为数据库的 **External Database URL**，或删 Web 后按 Blueprint 在 Oregon 重建。

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | Render Postgres 连接串（Blueprint 注入） |
| `WEB_ORIGIN` | 浏览器访问的 HTTPS 源，与 Cookie/CORS 一致 |
| `RUN_SEED` | `1` 时容器启动执行 seed（**慎用**；日常建议 `0`） |
| `SEED_MODE` | `accounts`（仅账号）/ `ready`（+teacher_ready 数据）/ `full`（+teacher01 旧示例） |
| `SERVE_WEB` | `1` 由 API 托管静态前端 |
| `PORT` | Render 自动设置，勿改 |
| `DEEPSEEK_API_KEY` | （可选）选课助理共用 DeepSeek 密钥，在 Dashboard 设为 **Secret**，勿写入仓库 |
| `DEEPSEEK_API_URL` | （可选）OpenAI 兼容接口地址，自建代理时填写 |
| `DEEPSEEK_MODEL` | （可选）默认 `deepseek-chat` |

## 本地验证镜像

```bash
docker compose up -d
export DATABASE_URL=postgres://coursematch:coursematch@host.docker.internal:5432/coursematch
docker build -t coursematch:local .
docker run --rm -p 3001:3001 -e DATABASE_URL -e RUN_SEED=1 -e WEB_ORIGIN=http://localhost:3001 coursematch:local
```

## 其他平台（备选）

| 平台 | 说明 |
|------|------|
| **Railway** | 同样支持 Dockerfile + Postgres，按用量计费 |
| **Fly.io** | `fly launch` + Postgres，适合要固定区域时 |
| **Vercel + Neon** | 需拆前后端或改 API 为 Serverless，改动大，V1 不推荐 |

## 答辩 / README

部署成功后把公网 URL 写入 `README.md` 顶部与 `docs/V1_CHECKLIST.md` #7。
