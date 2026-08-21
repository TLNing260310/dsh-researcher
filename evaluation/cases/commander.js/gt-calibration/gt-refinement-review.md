# 冻结前审查报告 — Core Cognition GT v0.1（commander.js）

> 模式：v0.7.1 Core Cognition GT Refinement。输入：41 条 candidate GT（双 evaluator 校准产物）。输出：Core GT v0.1（25 条）/ Extended GT（16 条）/ Removed（0 条）/ gt-hierarchy.json。**未 lock、未 matrix、未 scoring。**
> 纪律：不新增 GT（仅从 41 条中划分）；不读取未来 commit；不参考 Researcher 输出；不调整规则适配实验结果。

## 1. 判定方法（预注册，运行前冻结）

每条候选按三问判定：

- **A — 项目理解核心**：缺失该条是否会导致对项目本质或关键机制的误解？
- **B — 影响未来修改决策**：任何未来修改是否必须知道该条？（"改 X 必须知道 Y"）
- **C — 关系/约束/设计意图**：是否为关系/约束/设计意图型，而非知识事实（文件列举可作答）？

入选规则：**Core = (A=high 且 B≥medium) 或 (B=high 且 A≥medium)，且 C 合格**；配额 20–25 条；超配额时按"与既有 Core 覆盖重叠"降级。

## 2. 判定总表（41 条）

| ID | 类别 | A | B | 判定 | 一句话理由 |
|---|---|---|---|---|---|
| C01 声明式核心机制 | identity | high | high | **Core** | 本质：描述→解析/帮助/错误 |
| C02 零依赖策略 | identity | high | high | **Core** | 身份约束：加依赖≈被拒 |
| C03 双入口 | identity | med | med | Extended | 影响测试/集成，非本质 |
| C04 严格默认+收紧 | identity | high | high | **Core** | 一切行为变更受 major 纪律 |
| C05 发布纪律 | identity | high | high | **Core** | 破坏性变更的时机约束 |
| C06 递归下降解析 | arch | high | high | **Core** | 核心解析流 |
| C07 值顺序+来源 | arch | high | high | **Core** | env/implied 语义变更波及面 |
| C08 help/version 通道 | arch | high | med | **Core** | 非显然架构事实 |
| C09 unknown 桶 | arch | high | high | **Core** | 跨层选项放置的关键 |
| C10 派发优先级 | arch | high | high | **Core** | 用户可见行为编码 |
| C11 hook 顺序 | arch | high | med | **Core** | 扩展作者依赖的顺序契约 |
| C12 action 签名 | arch | high | high | **Core** | 公共回调协议 |
| C13 executable 外部化 | arch | high | high | **Core** | 新子命令的命名/文件约定 |
| C14 祖先链校验 | arch | med | med | Extended | 有价值，非本质 |
| C15 globals-wins | arch | high | high | **Core** | 反直觉合并方向，改即破坏 |
| C16 双选项推断 | arch | high | high | **Core** | implies/conflict 语义之源 |
| C17 Help 管线 | arch | high | med | **Core** | 双定制缝的渲染管线 |
| C18 CJS/ESM | arch | high | high | **Core** | 加导出需多处同步 |
| C19 command.js 中枢 | critical | high | high | **Core** | 变更风险集中 |
| C20 parseOptions 密度 | critical | high | high | **Core** | 最锐利语义边 |
| C21 Help 扩展面 | critical | med | high | Extended* | B 高但与 C17 覆盖重叠 |
| C22 值管线耦合 | critical | high | high | **Core** | 语义同涨同落 |
| C23 exec 环境耦合 | critical | med | high | Extended* | 与 C13 覆盖重叠，留风险补充 |
| C24 typings 镜像 | critical | high | high | **Core** | API 变更三处同步 |
| C25 弃用目录 | design | high | high | **Core** | 重构与移除时机约束 |
| C26 可重入 parse | design | med | med | Extended | 状态模型部分重入 |
| C27 颜色漂移 | risk | med | med | Extended | 边缘约定 |
| C28 发布集中风险 | risk | med | med | Extended | 由 C05 派生 |
| C29 错误码契约 | critical | high | high | **Core** | 消费者匹配的稳定契约 |
| C30 TS 身份 | identity | med | med | Extended | 与 C24 相关 |
| C31 三处重推导 | critical | med | high | **Core** | 改配对模型须触三处 |
| C32 预格式化 | design | med | med | Extended | 用户契约但面窄 |
| C33 ESM 枚举 | risk | med | high | **Core** | 加导出触 5 面 |
| C34 exec help 回退 | arch | med | med | Extended | 流程约束 |
| C35 passThrough 不变量 | design | med | high | **Core** | 注册期 throw 的硬不变量 |
| C36 _optionValues 存储 | design | med | med | Extended | 存储模型决策 |
| C37 '--' 逃生舱 | design | med | med | Extended | UX 契约 |
| C38 EventEmitter 弱类型 | risk | med | med | Extended | 风险机制 |
| C39 派发回归史 | risk | med | med | Extended | 风险推理 |
| C40 单例风险 | risk | med | med | Extended | 集成面风险 |
| C41 help 环境依赖 | risk | med | med | Extended | 非确定性风险 |

*C21/C23：机械规则（B=high）会入选，但主题已由 Core C17/C13 覆盖；按"覆盖重叠降级"规则放入 Extended 作风险补充（理由写入 hierarchy）。

## 3. 输出

### Core GT v0.1 — 25 条（正式评分面，未锁定）
`core-gt-v0.1.json`（含 claim/evidence/relation/understanding_value/confidence/judge）。
构成：identity 4（C01,C02,C04,C05）· architecture_relation 12（C06–C13,C15–C18）· critical_component 6（C19,C20,C22,C24,C29,C31）· design_decision 2（C25,C35）· risk_surface 1（C33）。

### Extended GT — 16 条（保留，供后续/探索性分析）
C03, C14, C21, C23, C26, C27, C28, C30, C32, C34, C36, C37, C38, C39, C40, C41。每条的保留价值与判定见 hierarchy（`gt-hierarchy.json`）。

### Removed GT — 0 条
41 条候选**无一为知识事实桶**（校准阶段"无文件列举可作答条目"规则已比 15% 上限更严），且无冗余到需要删除的条目（C21/C23 通过降级而非删除处理；C28/C30 与 C05/C24 的相关性已在 Extended 中标注）。Removed 为空是校准质量的结果，不是省略。

## 4. 桶分布与 GUS 权重的关系（诚实呈现，不调整规则）

| 权重桶 | Core 条数 | Core 占比 | GUS 设计权重 | 观察 |
|---|---|---|---|---|
| architecture_relation | 16 | 64% | 40% | **偏重** |
| key_constraints | 7 | 28% | 20% | 偏重 |
| design_purpose | 2 | 8% | 25% | **偏轻** |
| factual_accuracy | 0 | 0% | 15% | 规则内允许（≤15%） |

解读：commander.js 的核心理解真实集中在架构关系与约束（递归下降、值顺序、unknown 桶、契约类），design_purpose 桶仅 C25/C35 达核心标准，其余设计条目（C26/C32/C36/C37）A 均为 medium。**处理选项（不修改规则，二选一由评测执行时定）**：
- 选项 1（推荐）：GUS 按桶加权计算时，design_purpose 桶以 2 条计（统计噪声如实报告，mean+range 呈现）；Extended 中 7 条设计条目作为补充评分面单独报告，不进主 GUS。
- 选项 2：GUS 主评分仅用 arch+constraint 两桶加权（偏离协议 v1.1 §5.1 权重 → 需协议级讨论，本次不执行）。
本次保持选项 1 的表述，不在 refinement 阶段改动评分规则。

## 5. 条间关联提示（供评分器与裁决参考，非规则变更）

- C16 ↔ C31：双选项机制（值推断）与三处实现点互为表里；评分时视为同一理解面，避免重复计分争议（记入评分说明，不删除任何一条）。
- C18 ↔ C33：ESM 架构与手动枚举风险同理。
- C08 ↔ C34：help 通道与 executable help 回退同属 help 语义面。
- C25 ↔ C28：弃用目录与发布模型风险相关，但分属 Core/Extended。

## 6. 冻结前检查清单（本报告后、lock 前必须完成）

1. 双 evaluator 确认 25 条 Core 的合并表述与证据锚（任何异议 → ambiguous 不进主评分）。
2. `core-gt-v0.1.json` 按本报告定稿后 sha256 锁定，写入实验 snapshot.json。
3. v1.1 lock（含 GT 输入 `--gt core-gt-v0.1.json`）创建并 `--check` 通过。
4. 之后才允许 Experiment A 正式 12-run。

## 7. 结论

Core Cognition GT v0.1（25 条）通过冻结前审查条件：全部为关系/约束/设计意图型，A/B 判定记录完整可复现，配额合规（25/20–25），桶偏差已诚实呈现且处理选项明确。**允许进入冻结流程（checklist 1–3 完成后）。**

产物：`core-gt-v0.1.json`（25 条）· `gt-hierarchy.json` · `refine-core-gt.js`（判定可复现脚本）· 本报告。
