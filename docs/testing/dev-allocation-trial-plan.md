# Dev 联调工具 · 第 1 轮分配测试计划

> 教师端「分配结果」页底部 **联调工具**（仅 `ENABLE_DEV_TOOLS=1`）。  
> 目标：不逐个登录学生，也能反复验证 **填报 → 截止 → 冻结 → 主分配 → 结果** 全链。

## 1. 目标与非目标

| 目标 | 非目标 |
|------|--------|
| 一键写入名单内已开号学生的 1 个班选择 | 生产环境默认开启 |
| 清空志愿/快照/分配，便于换策略再跑 | 改主分配算法 |
| 联调截止 + 冻结 + 分配流水线 | 到点自动冻结/分配（仍由教师或 Dev 流水线触发） |
| 教师汇总与学生 `results/me` 可对照 | 学生端联调按钮 |

## 2. 前端（三按钮）

位置：`/teacher/courses/:activityId/results` 底部折叠卡片 **「联调工具 · Dev」**。

| # | 按钮 | 行为 |
|---|------|------|
| ① | 模拟全员填报 | 策略（同班/轮询/随机）、留 N 人不填 → 仅写 `preference` |
| ② | 清空本轮联调 | 二次确认 → 删志愿/快照/分配，活动回到 `PUBLISHED` |
| ③ | 立即到达截止 | 将开始/截止调到过去 → 页面呈「已截止」；**冻结与主分配走上方正式按钮** |

`ENABLE_DEV_TOOLS` 为假时：整块不渲染（不依赖前端构建变量）。

## 3. API（均需教师 owner + Dev 开关）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/meta/features` | `{ devTools: boolean }` |
| GET | `/api/activities/:id/dev/trial-preview` | 名单/开号/班数量 |
| POST | `/api/activities/:id/dev/simulate-preferences` | body: strategy, skipUnfilledCount |
| POST | `/api/activities/:id/dev/reset-trial` | 清空联调数据 |
| POST | `/api/activities/:id/dev/reach-deadline` | 立即到达截止（Dev） |
| POST | `/api/activities/:id/dev/run-allocation-trial` | （遗留）流水线；UI 已不用，正式流程走页面按钮 |

## 4. 验收标准

### 4.1 开关与权限

- [ ] `ENABLE_DEV_TOOLS` 未设置或为 `0` 时，上述 POST 返回 **404**（或 403，实现统一即可）。
- [ ] 非本活动教师、学生账号调用 POST → **403**。
- [ ] Dev 开启时，分配结果页可见折叠联调区；生产配置关闭时不可见。

### 4.2 ① 模拟全员填报

- [ ] 仅 **FILLING** 阶段可执行；已关闭/作废 **409**。
- [ ] 仅为 **本活动 participant 且已建 account** 写入 **1 个** topicId；未开号学号在响应 `skippedNoAccount` 列出。
- [ ] `skipUnfilledCount = N` 时，按学号排序后 **最后 N 名已开号学生** 不写入（测 NOT_SUBMITTED）。
- [ ] 策略 **same_first**：全部选第一个可参与班（`eligibility_mode=ALL` 或 EXPLICIT 合格）。
- [ ] 策略 **round_robin**：按学号在 topic 列表轮询。
- [ ] 执行后学生 `GET preferences/me` 与教师汇总热度一致（抽查 1 人）。

### 4.3 ② 清空本轮联调

- [ ] 删除本活动所有 `preference`、冻结快照、分配批次及结果；`operation_log` 上相关 FK 置空后再删批次/快照。
- [ ] 活动 `lifecycle` 从 `ALLOCATED` 回到 **`PUBLISHED`**，且 **回到 FILLING**（`start_at` 不晚于现在、`deadline_at` 延 7 天）。
- [ ] **不删** participant、topic、account；`config_version` 不变。
- [ ] `CLOSED` / `VOID` 活动拒绝清空。

### 4.4 ③ 一键跑通分配

- [ ] 按勾选顺序执行；任一步失败则 **停止** 并返回 `{ step, error }`，不 silent 继续。
- [ ] 步骤 **simulate**：同 ①。
- [ ] 步骤 **deadline**：若 `now < deadline_at`，将 `deadline_at` 设为 **1 分钟前**（仅 Dev，响应中说明）。
- [ ] 步骤 **freeze**：与正式 `POST .../freeze` 等价，生成快照。
- [ ] 步骤 **allocate**：与正式 `POST .../allocation` 等价；汇总含 assigned / unallocated / notSubmitted。
- [ ] 已有 batch 时再次 allocate 仍 **幂等**（返回已有 batch）。

### 4.5 第 1 轮手测剧本（Dev）

- [ ] **剧本 A**：小容量班 + ③ 同班 + 留 5 人不填 → 分配后同时存在 ASSIGNED、UNALLOCATED、NOT_SUBMITTED。
- [ ] **剧本 B**：② 清空 → ③ 轮询 → 分配结果与 A 不同。
- [ ] 抽 2 个学号「我的结果」与教师汇总行一致。

### 4.6 自动化

- [ ] `dev-trial-lib` 策略单测 ≥ 3 条。
- [ ] `npm test` 全绿。

## 5. 实施顺序

1. `ENABLE_DEV_TOOLS` + `/api/meta/features` + 计划文档（本文件）。
2. 后端 simulate / reset / run + preview。
3. 前端 `DevTrialPanel` + 接入分配结果页。
4. `.env.example` / `docs/deploy/dev-render.md` 补充变量。
5. 手测剧本 A/B 留截图或终端日志。

## 6. Dev 环境

Render **coursematch-dev** 增加环境变量：

```bash
ENABLE_DEV_TOOLS=1
```

部署后教师进入 **分配结果** 展开联调区验证。
