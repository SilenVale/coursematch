# CourseMatch

> 软件工程课程项目：学生选题系统

## 当前状态

共同工程底座已进仓库：monorepo、PostgreSQL 迁移、种子账号、登录会话、活动列表只读、前端壳与占位页。业务接口除认证与活动读取外返回 501，由三位组员在约定目录实现。

架构契约：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)（来源：设计报告 v0.5，平台最高分 98.6）。类型：[docs/contracts/api-contracts.ts](docs/contracts/api-contracts.ts)（与 `packages/shared` 同步）。

**第一版范围与优秀线勾选：** [docs/V1_DELIVERY_PLAN.md](docs/V1_DELIVERY_PLAN.md)（组员与 Agent 实现业务前必读）。

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

含 `packages/allocation` 主分配固定样例测试。

## 组员从哪开始

| 成员 | 前端 | 后端 |
|---|---|---|
| 石俊贤 | `apps/web/src/pages/teacher/ActivityConfigPlaceholder.tsx` | `apps/api/src/routes/activities/config.ts` |
| 刘家铭 | `apps/web/src/pages/student/*` | `apps/api/src/routes/activities/preferences.ts`、`results.ts`（学生本人结果） |
| 罗子超 | `apps/web/src/pages/teacher/FreezeAllocationPlaceholder.tsx` | `packages/allocation/`、`freeze-allocation.ts`、`results.ts`（教师侧） |

细节：[docs/INTERNAL_MODULES.md](docs/INTERNAL_MODULES.md)、[docs/ALLOCATION.md](docs/ALLOCATION.md)。

从 `master` 拉分支，小 PR 合并。改共享类型或迁移前先沟通。

## 协作入口

- [项目任务契约](docs/PROJECT_CONTRACT.md)
- [团队协作规则](docs/COLLABORATION.md)
- [课程核验证据索引](docs/EVIDENCE_INDEX.md)
