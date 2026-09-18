# CourseMatch

> 软件工程课程项目：学生选题系统

CourseMatch 是一个面向课程项目的选题、志愿填报与结果公示系统。它的目标是让题库维护、学生选题、名额限制和分配过程更公开、更清楚，减少“想选的题目已被抢走、为什么这样分配”的沟通成本。

## 当前状态

项目处于第一周立项阶段。当前已建立仓库与协作规范；团队名单、会议记录、思维导图和 NABCD 分析将在 Gitee Wiki 中留存。

## 第一版范围

- 教师发布和维护课程题目；
- 学生浏览、筛选并填报志愿；
- 系统检查题目名额和重复申请；
- 教师查看申请并确认分配；
- 学生查看自己的结果和公开的选题进度。

第一版不做移动端 App、支付、完整教学管理系统或复杂 AI 自动决策。

## 协作入口

- [项目任务契约](docs/PROJECT_CONTRACT.md)
- [团队协作规则](docs/COLLABORATION.md)
- [AI 协作规则](AGENTS.md)
- Gitee Wiki：课程立项、原型、进度计划、测试和用户反馈的过程证据。

## 开发约定

1. `master` 始终保持可运行、可演示；不直接向 `master` 推送。
2. 每个 Issue 从 `master` 新建独立分支，完成后通过 Pull Request 合并。
3. 先读取 `AGENTS.md`、项目契约和协作规则，再开始修改代码或文档。
4. 技术栈尚未冻结；第二周需求分析完成后再补充本地启动与测试命令。

## 本地初始化

```bash
git clone https://gitee.com/SilenVale/coursematch.git
cd coursematch
git switch master
git pull --ff-only
```

后续根据确定的技术栈补充安装、启动和测试命令。
