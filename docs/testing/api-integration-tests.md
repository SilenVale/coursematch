# API 集成测试入库方案（负责人决议）

> **决议日期：** 2026-10-24（汪奕辰）  
> **背景：** PR #21 评论中的方案 A/B，石俊贤在开依赖 PR 前需统一口径。

## 决议：采用方案 **A**（docker-compose + 真实 PostgreSQL）

| 方案 | 做法 | 结论 |
|------|------|------|
| **A（选用）** | CI / 本地验收：`docker compose up -d` 后，对真实 PG 跑迁移 + `buildApp()` 集成用例 | **仓库标准** |
| **B（不入库）** | 嵌入式 PGlite，无 Docker | 可作个人本地加速，**不**作为 `master` 默认依赖与 CI 路径 |

### 理由（简要）

1. **与 V1 环境一致：** README、联调 runbook、种子数据均假定同一套 Postgres；集成测应覆盖真实迁移与 SQL 行为。  
2. **零新增 npm 依赖：** 不引入 PGlite 及其与 pg 特性的差异风险。  
3. **CI 可复现：** GitHub Actions 使用 `services.postgres` 或 compose 即可，与组员本地一致。  
4. **PGlite 的定位：** 若在个人分支已用 PGlite 跑出 M2 用例证据，可作为**补充说明**写入测试记录，但合并进 `master` 的脚本以 **A** 为准。

## 入库要求（石俊贤后续 PR）

- 测试入口纳入根目录 `npm test` 或单独 `npm run test:api:integration`（在 PR 中说明）。  
- 文档：如何启动 DB、如何一键跑（引用 `docs/testing/v1-e2e-runbook.md` 的环境准备）。  
- 不得默认依赖 PGlite；若 PR 仅文档用例表（如 #21），保持现状即可。

## 参考

- [v1-e2e-runbook.md](./v1-e2e-runbook.md)  
- [m2-test-cases.md](./m2-test-cases.md)
