# 罗子超 · M4/M5 测试与体验反馈（任务说明）

> 发给罗子超及其 AI 用：自行设计测试方案、验证分配准确性、整理使用建议。  
> 公网 Dev：<https://coursematch-dev.onrender.com> · 仓库：<https://github.com/SilenVale/coursematch>

## 1. 目前已完成什么（概括）

V1 **主链已在 `master` 接通**：教师创建/配置/发布选课、参与名单与开设课程、学生志愿填报与「我的结果」、**截止后冻结快照 + lottery 序号 + 主分配**、教师分配汇总/证据/关闭。

M2 等已有 **集成测试（如 PR #28）**、公网冒烟（登录、学生可见活动、填志愿）——**不必再完整跑第二遍**。

**你主要负责：**

1. 自己设计测试方案，重点验证 **冻结 / 分配 / 结果是否准确**（对照 [ALLOCATION.md](../ALLOCATION.md)）。
2. 填 [V1_CHECKLIST.md](../V1_CHECKLIST.md) **#2、#4** 的证据。
3. 整理 **使用建议与缺口反馈**（可用 AI 辅助写用例、对期望、写报告）。

**不必重做：** M2 发布/名单全流程、学生填志愿主流程、HTTPS 部署验收（#7 已勾）。

---

## 2. 演示账号

统一密码：**`Coursematch-Dev-2026`**

| 账号 | 角色 | 说明 |
|------|------|------|
| `teacher_blank` | 教师 | 从零建任务；Dev 上另有他人已建的「软件工程」 |
| `teacher_ready` | 教师 | 种子 `SEED_MODE=ready` 或 `full` 时带预置选课 |
| `teacher01` | 教师 | 种子 `SEED_MODE=full` 时带旧版示例 |
| `20260001` / `20260002` | 学生 | 志愿填报、我的结果 |

换号 / 退出：页面 **右上角** 点击显示名（如 `teacher_blank 教师`）→ **切换账号** 或 **退出登录**。

---

## 3. Dev（Render）数据 vs 本地 —— **不是同一份业务数据**

| | 说明 |
|---|------|
| **相同** | 同一仓库、迁移与 seed **脚本**；演示账号与密码（README）。 |
| **不同** | **Render Dev** 使用共用 Postgres，除种子外还有 **线上操作**（见 §6）。**本地** `npm run seed` 按 `SEED_MODE` **重写**种子数据，默认 **`accounts` 仅账号、无他人建的「软件工程」**。 |
| **Render** | 通常 `RUN_SEED=0`，重启不会自动洗库。 |
| **本地** | `SEED_MODE`：`accounts`（默认）/ `ready` / `full`，见 [README.md](../../README.md)。 |

**结论：** 无法「把 Dev 数据库爬下来」与本地 seed 状态一一对应。  
**建议：** **测试以本地为主**（自建活动、**短截止**，便于冻结/分配）；Render 作公网抽测或查看现状。

---

## 4. 本地环境（从仓库开始）

```bash
git clone https://github.com/SilenVale/coursematch.git
cd coursematch
cp .env.example .env
docker compose up -d
npm install
set -a && source .env && set +a   # macOS/Linux；Windows 请自行 export DATABASE_URL
npm run migrate && npm run seed
npm test
npm run dev:api    # 终端 1 → http://localhost:3001
npm run dev:web    # 终端 2 → http://localhost:5173
```

需要预置示例活动：`.env` 设 **`SEED_MODE=ready`** 后再 `npm run seed`（会洗库，先读 README）。

教师入口：**工作台 → 选课任务 → 分配结果**（生成冻结快照 / 执行主分配 / 查看证据）。

部署说明：[dev-render.md](../deploy/dev-render.md)。

---

## 5. 你要做的事（精简）

1. **自设计 1～2 套流程**（名额冲突、未提交、落选、多志愿等），本地跑通 **冻结 → 主分配**，核对与 [ALLOCATION.md](../ALLOCATION.md) 及固定样例是否一致。
2. **抽测边界**：截止前不能冻结；无 READY 快照不能分配；重复 `POST .../allocation` 幂等；学生调 freeze/allocation → 403（见 [v1-e2e-runbook.md](./v1-e2e-runbook.md) §6，不必复刻 §1–2 全链）。
3. **核对** 教师 `GET .../results` 与学生 `GET .../results/me` 一致。
4. **交付**：测试方案摘要 + 截图/命令输出 + checklist #2/#4 + **《使用建议与问题清单》**（难用点、缺逻辑、与文档不一致处）。

---

## 6. Dev 上当前已知现状（参考，非必测）

- 活动 **「软件工程」**：`teacher_blank`，**填报中**，截止约 **2026/10/30**，2 门可选课，名单 10 人。
- **20260001** 已填志愿；**20260003–10** 若未在教师端「为未开通学生创建登录账号」则无法登录。
- 该活动 **截止前无法冻结**；分配测试请 **本地自建短截止活动** 或使用种子 `ready/full` 里 **已截止示例**（若环境仍有）。

---

## 7. 请 AI 优先阅读（按顺序）

1. [罗子超-M4M5-冻结分配与教师结果.md](../roles/罗子超-M4M5-冻结分配与教师结果.md)
2. [ALLOCATION.md](../ALLOCATION.md)
3. `packages/allocation/src/calculate.ts`、`calculate.test.ts`
4. `apps/api/src/routes/activities/freeze-build.ts`、`freeze-allocation.ts`
5. [v1-e2e-runbook.md](./v1-e2e-runbook.md)（参考，非逐步复刻）
6. [AGENT_START.md](../AGENT_START.md)（改代码时的边界）

**给 AI 的任务示例：** 基于以上文档，设计 2 套测试方案（最小 lottery 冲突场 + 混合提交场），输出步骤、期望状态表、证据清单、对应 checklist 行号。
