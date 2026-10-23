# CourseMatch

> 软件工程课程项目：学生选题系统

## 当前状态

**V1 业务主链已在 `master` 接通**（本地或 Dev 公网可演示）：教师活动配置与发布、学生志愿、截止后冻结与主分配、教师汇总/证据/关闭、学生本人结果 API 与页面。Dev HTTPS 已上线；§1.4 八条证据汇总与 runbook 留证仍在推进中。

架构契约：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)（来源：设计报告 v0.5，平台最高分 98.6）。类型：[docs/contracts/api-contracts.ts](docs/contracts/api-contracts.ts)（与 `packages/shared` 同步）。

**第一版范围与优秀线勾选：** [docs/V1_DELIVERY_PLAN.md](docs/V1_DELIVERY_PLAN.md) · 勾选表：[docs/V1_CHECKLIST.md](docs/V1_CHECKLIST.md) · 联调步骤：[docs/testing/v1-e2e-runbook.md](docs/testing/v1-e2e-runbook.md)

**Dev 公网环境（Render，HTTPS）：** [https://coursematch-dev.onrender.com](https://coursematch-dev.onrender.com)（健康检查：`GET /api/health`）。部署说明见 [docs/deploy/dev-render.md](docs/deploy/dev-render.md)。

**组员任务卡与 Agent 开场词：** [docs/roles/README.md](docs/roles/README.md)、[docs/AGENT_START.md](docs/AGENT_START.md)。

## 本地启动

```bash
git clone https://github.com/SilenVale/coursematch.git
cd coursematch
cp .env.example .env
docker compose up -d
npm install
npm run migrate
npm run seed
npm run dev:api    # 终端 1，http://localhost:3001
npm run dev:web    # 终端 2，http://localhost:5173
```

### 环境变量

`.env` 放在**仓库根目录**。若 `npm run migrate` 报 `DATABASE_URL is required`，在根目录执行：

```bash
set -a && source .env && set +a && npm run migrate && npm run seed
```

（macOS/Linux；Windows 可用等价方式导出变量，或将 `.env` 复制到 `apps/api/.env`。）

### 种子账号（仅开发）

| 角色 | 账号 | 密码 |
|---|---|---|
| 教师 | `teacher01` | `Coursematch-Dev-2026` |
| 学生 | `20260001` / `20260002` | `Coursematch-Dev-2026` |

教师可见草稿与已发布活动；学生仅可见已发布且自己在名单内的活动。

### 测试

```bash
npm test
```

含 `packages/allocation` 主分配固定样例与 `apps/api` 路由单测。

生产构建（联调前建议跑一次）：

```bash
npm run build
```

## 组员从哪开始

每人先打开 **[docs/roles/](docs/roles/)** 里自己的任务卡（含验收清单与允许改动的路径），再用 **[docs/AGENT_START.md](docs/AGENT_START.md)** 约束 Agent。

| 成员 | 任务卡 |
|---|---|
| 石俊贤 | [石俊贤-M2-活动配置.md](docs/roles/石俊贤-M2-活动配置.md) |
| 刘家铭 | [刘家铭-M3-志愿与学生结果.md](docs/roles/刘家铭-M3-志愿与学生结果.md) |
| 罗子超 | [罗子超-M4M5-冻结分配与教师结果.md](docs/roles/罗子超-M4M5-冻结分配与教师结果.md) |
| 汪奕辰 | [汪奕辰-集成与验收.md](docs/roles/汪奕辰-集成与验收.md) |

细节：[docs/INTERNAL_MODULES.md](docs/INTERNAL_MODULES.md)、[docs/ALLOCATION.md](docs/ALLOCATION.md)。

从 `master` 拉分支，小 PR 合并。改共享类型或迁移前先沟通。

## 协作入口

- [项目任务契约](docs/PROJECT_CONTRACT.md)
- [团队协作规则](docs/COLLABORATION.md)
- [课程核验证据索引](docs/EVIDENCE_INDEX.md)
