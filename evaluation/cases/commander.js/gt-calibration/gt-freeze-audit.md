# GT Freeze Audit — Core Cognition GT v0.1（commander.js）

> 模式：v0.7.1 GT Freeze Audit。目标：冻结前最小审计（不重新设计、不修改 Core GT 内容、不读取 Researcher 实验结果、不 lock/matrix/scoring）。
> 审计对象：`core-gt-v0.1.json`（25 条）+ `coverage-map.json`（防重复计分）+ manifest 声明（时间线/独立性）。

## 1. 反事实删除测试（Counterfactual Deletion Test，25/25）

规则：对每条 Core 问 —— **删除该认知点：一个工程师不知道它，是否更容易错误修改？** pass = 是（删除会增加错误修改风险）；fail = 否。附 strong/weak（影响面宽窄）。

| ID | 认知点 | 反事实：不知道它会怎样 | 判定 |
|---|---|---|---|
| C01 | 声明式核心机制 | 误加命令式处理、误解 API 目的 | pass (strong) |
| C02 | 零依赖策略 | 提出加依赖方案（维护者拒绝；浪费一轮） | pass (strong) |
| C04 | 严格默认+major 收紧 | 在 minor 引入宽松/严格变更 | pass (strong) |
| C05 | 发布纪律 | 在非 major 做破坏性变更 | pass (strong) |
| C06 | 递归下降解析 | 误解参数在哪一层被消费 | pass (strong) |
| C07 | 值顺序+来源打标 | 改 env/implied 优先级，破坏来源语义 | pass (strong) |
| C08 | help/version 通道 | 误改 help 检测路径或冲突语义 | pass (weak) |
| C09 | unknown 桶机制 | 破坏跨层选项传递 | pass (strong) |
| C10 | 派发/错误优先级 | 改错错误选择或派发顺序 | pass (strong) |
| C11 | hook 顺序（postAction 反转） | 扩展 hook 清理顺序写错 | pass (weak) |
| C12 | action 签名协议 | 破坏回调参数契约 | pass (strong) |
| C13 | executable 外部化契约 | 破坏子命令命名/文件约定（新子命令找不到） | pass (strong) |
| C15 | globals-wins 合并方向 | 改错合并方向（破坏性） | pass (strong) |
| C16 | 双选项值推断 | 破坏 implies/conflict 语义 | pass (strong) |
| C17 | Help 渲染管线 | 改 help 渲染改错层，破坏定制缝 | pass (weak) |
| C18 | CJS/ESM 单实现+包装 | 加导出漏同步模块面 | pass (strong) |
| C19 | command.js 中枢 | 低估修改风险面 | pass (strong) |
| C20 | parseOptions 语义密度 | 破坏解析语义（最大回归面） | pass (strong) |
| C22 | 值管线耦合点 | 改 option 语义漏掉共享路径 | pass (strong) |
| C24 | typings 镜像/三同步 | 改 API 漏同步类型契约 | pass (strong) |
| C25 | 弃用目录兼容负担 | 破坏兼容承诺/错误移除时机 | pass (strong) |
| C29 | 错误码稳定性契约 | 破坏消费者匹配（exitOverride 生态） | pass (strong) |
| C31 | 双选项三处重推导 | 改一处漏两处 | pass (strong) |
| C33 | ESM 手动枚举面 | 加导出漏 5 面同步 | pass (strong) |
| C35 | passThrough 父子不变量 | 违反注册期约束 | pass (strong) |

**结果：25/25 pass（19 strong / 3 weak / 3 边界弱项 C08/C11/C17）**。weak 项的影响面窄于其他 Core（help 子系统与 hook 扩展者），但删除后仍存在可识别的错误修改路径 → 保留在 Core，不降级。无反事实删除测试 fail 项 → 25 条全部通过 Core 资格复核。

## 2. Coverage Map（防重复计分）

`coverage-map.json`：**2 个合并簇 + 21 条独立**，`max_total_credit = 23`（GUS 分母按 credit 而非条数）。

| 簇 | 条目 | max_credit | 理由 |
|---|---|---|---|
| cross-level argument passing | C06, C09 | 1.0 | 递归下降流与 unknown 桶下传是同一认知单元（"参数最终到哪"）；一次连贯描述必然同时覆盖两者 |
| dual-option shared-key semantics | C16, C31 | 1.0 | 值推断启发式与其三处实现点是同一认知单元；C31 提供"改哪"而非独立理解 |

保守合并原则：仅合并真正同源的成对条目；近相关对（C18/C33 模块互操作、C08/C17 help 系统、C19/C22 风险集中、C25/C29 兼容契约）保持独立——它们描述不同认知单元（架构 vs 变更面、检测 vs 渲染）。

## 3. Manifest 声明（防第三方质疑）

已写入 `evaluation/cases/commander.js/manifest.json` 的 `gt` 字段：

- **created_before_any_scored_run: true** —— GT 在任何正式（scored）Experiment A 运行之前生成。
- **evaluator_independence** —— 两个 evaluator 无共享上下文，各自被指示只读 T0 快照、禁网络、禁咨询；未向任何 evaluator 提供模型输出。
- **researcher_output_used: false** —— 校准聚类与 refinement 仅使用两份 evaluator 文件与预注册 A/B/C 判定规则。
- **timeline_note（诚实披露）** —— 一个**非评分** PCR pilot（输出形态验证）运行于 GT 编译之前；evaluator 提示词明确禁止读取它；每条 GT 的证据均为快照 file:line 锚，可独立核查。第三方可据此审计盲测链的每一个环节。
- 疑点自答："你是不是看了模型答案调整 GT？" —— 时间线显示 pilot 先于 GT 编译，但 pilot 非评分、未被 evaluator 读取、未被聚类/refinement 引用；且所有 GT 条目证据直接指向快照，不依赖任何模型输出存在。

## 4. 评分解释修正（采纳评审意见）

冻结后报告与评分文档中，桶分布表述统一为：

> GT composition follows repository intrinsic cognitive structure; category imbalance is expected when evaluating different project types.

不再使用"架构 64%、设计 8% → 理解偏向架构"这类易误导的表述。commander.js 是成熟基础库，其认知价值天然集中于 parser pipeline / compatibility / dispatch contract；未来切换 Kubernetes/React/database 类仓库时比例会自然不同，不做人为均衡。

## 5. 冻结前最终清单（审计通过项）

1. ✅ 反事实删除测试：25/25 pass（无 fail）
2. ✅ coverage-map.json：合并重复认知单元、max_credit 定义、GUS 分母 = 23 credit
3. ✅ manifest：时间线 + 独立性 + 未使用 Researcher 输出声明
4. ✅ Core GT 内容未改动（`core-gt-v0.1.json` 与 refinement 输出逐字节一致）
5. ✅ 未 lock / 未 matrix / 未 scoring

**剩余动作（本审计之外，需你批准）**：sha256 锁定 core-gt-v0.1.json → v1.1 lock（含 `--gt --coverage` 输入）→ `--check` → Experiment A 正式 12-run。

## 6. 结论

Core Cognition GT v0.1（25 条 + coverage map + 声明）通过冻结审计。**允许进入冻结流程。**
