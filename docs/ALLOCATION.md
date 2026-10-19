# 主分配算法（实现规格）

来源：个人设计报告 v0.5 §7。罗子超在 `packages/allocation` 实现并测试；不得改成按学生顺序逐人尝试三个志愿。

## 输入

只有 `FrozenInput`：冻结时的题目容量、参与者名单、每人唯一 `lotteryNumber`、每人有效志愿有序列表（未提交则为空列表）、每人每题是否合资格。

## 伪代码

```text
remainingSlots = 按冻结题目容量初始化
assignedParticipants = 空集合

for preferenceRank in 1..maxPreferences:
    candidateGroups = 尚未分配且实际填写该位次者，按 topicId 分组
    for topicGroup in candidateGroups:
        availableAtRoundStart = remainingSlots[topicGroup.topicId]
        eligibleCandidates = 满足资格者，按 lotteryNumber 升序
        selected = 取 eligibleCandidates 前 availableAtRoundStart 人
        记录本轮说明，写入命中位次 preferenceRank
        selected 加入 assignedParticipants
        remainingSlots[topicGroup.topicId] -= selected 人数

为每个冻结参与者生成一条结果：
  已命中 → ASSIGNED
  无有效提交 → NOT_SUBMITTED
  有提交无命中 → UNALLOCATED
```

`remainingSlots` 仅是算法内临时变量，不是可跨请求扣减的数据库余额。

## 固定验收样例

| 参与者 | 冻结序号 | 有效志愿 |
|---|---|---|
| A | 3 | [甲] |
| B | 2 | [乙, 甲] |
| C | 1 | [乙] |
| D | 4 | 未提交 |

甲、乙容量各 1。结果：A→甲，C→乙，B→UNALLOCATED，D→NOT_SUBMITTED。同一 `FrozenInput` 再算一遍，输出必须完全一致。

实现与测试：`packages/allocation/src/calculate.ts`、`packages/allocation/src/calculate.test.ts`。
