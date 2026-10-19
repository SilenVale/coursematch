# CourseMatch

> 软件工程课程项目：学生选题系统

CourseMatch 是一个面向课程项目的选题、志愿填报与结果公示系统。它的目标是让题库维护、学生选题、名额限制和分配过程更公开、更清楚，减少“想选的题目已被抢走、为什么这样分配”的沟通成本。

## 当前状态

立项和需求材料已在仓库中。2026-10-20 起，开发以 [共享架构](docs/ARCHITECTURE.md) 和 [API 契约](docs/contracts/api-contracts.ts) 为准。仓库里还没有可运行的应用。早期需求稿中的补选、退选和成功后改结果不在本轮开发范围。

## 第一版范围

- 教师设置选题活动、参与名单、题目名额、资格条件及截止时间；
- 学生浏览题目，提交 1～3 个有序且不重复的志愿；
- 截止后冻结数据，按志愿轮次优先、同题同轮超额时按冻结序号分配；
- 学生查看个人结果与原因；未分配者保持未分配，不进入补选。

第一版不做退选、补选、成功后改结果、移动端 App、支付、完整教学管理系统或 AI 自动分配。

## 协作入口

- [共享架构](docs/ARCHITECTURE.md)
- [API 契约](docs/contracts/api-contracts.ts)
- [项目任务契约](docs/PROJECT_CONTRACT.md)
- [团队协作规则](docs/COLLABORATION.md)
- [AI 协作规则](AGENTS.md)
- [课程核验证据索引](docs/EVIDENCE_INDEX.md)：按 GitHub 提交版本定位立项、需求与讨论证据，注明缺失项。

## 开发约定

1. `master` 始终保持可运行、可演示；不直接向 `master` 推送。
2. 每个 Issue 从 `master` 新建独立分支，完成后通过 Pull Request 合并。
3. 先读取 `AGENTS.md`、项目契约和协作规则，再开始修改代码或文档。
4. 技术栈已统一为 React、Vite、TypeScript、Fastify 和 PostgreSQL。全组一个前端工程，说明见 [共享架构](docs/ARCHITECTURE.md)。可运行的安装和启动命令在工程进入仓库后再补。

## 本地初始化

```bash
git clone https://github.com/SilenVale/coursematch.git
cd coursematch
git switch master
git pull --ff-only
```

后续根据确定的技术栈补充安装、启动和测试命令。
