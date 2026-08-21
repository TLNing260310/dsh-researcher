# Cognition GT Calibration Report v0.1 — commander.js

> 模式：v0.7.1 Cognition GT Calibration。目标：验证 cognition GT 制定流程本身（防"专家选自己认为重要的"偏差），产出共识 GT 候选。对象：commander.js T0 快照（bf35c5f，v14.0.3，2026-02-01）。未评分、未跑矩阵、未冻结 lock。
> 方法：两个**真正独立**的 evaluator（无共享上下文的独立代理），各自只读 T0 快照，各自产出 GT 候选（规则：禁文件列表事实/纯代码位置/bug 罗列；每条须含 claim/evidence/relation/understanding_value/category/confidence）。然后做主题级一致性聚类。

## 1. 输入

| Evaluator | 条目数 | identity | architecture_relation | critical_component | design_decision | risk_surface |
|---|---|---|---|---|---|---|
| A | 45 | 7 | 15 | 7 | 8 | 8 |
| B | 39 | 6 | 14 | 6 | 6 | 7 |
| 目标区间 | 30–55 | 5–8 | 10–15 | 5–8 | 5–8 | 6–10 |

两方都独立拒绝同类违禁条目（文件计数、纯位置、bug 预测），并各自记录 4–6 条"差点收录但拒绝"项（见 §5）——规则执行一致性良好。

## 2. 一致性分析（主题级聚类，84 条 → 47 个主题）

### 共识主题（A、B 独立命中同一主题）—— **27 个**

| # | 主题（合并主张） | A 条目 | B 条目 | 类别 |
|---|---|---|---|---|
| C01 | 声明式核心价值机制：描述 CLI → 派生出解析/错误/帮助 | A-01 | B-01 | identity |
| C02 | 零依赖是身份而非巧合：策略 → 手写实现 → 供应链约束 | A-07, A-30 | B-03 | identity+design |
| C03 | 单例 program 与本地 Command 双入口，同一实现 | A-02 | B-04 | identity |
| C04 | 严格默认 + 显式逃生舱（allow*）；严格化按 major 逐步收紧 | A-03, A-04, A-37 | B-05 | identity+design |
| C05 | semver 纪律：major ≈ 每 6 个月对齐 Node LTS EOL；旧线 12 个月安全 | A-05 | B-06 | identity |
| C06 | 递归下降解析：每层消费自己的选项，余量下传 | A-08 | B-10 | arch |
| C07 | 值解析顺序 cli>env>implied + 来源打标（_optionValueSources） | A-09, A-10 | B-08 | arch |
| C08 | help 选项惰性、非注册、走 unknown 通道（对比 version 注册路径） | A-11, A-12 | B-11 | arch |
| C09 | unknown 桶翻转机制：首个未识别选项后全部转 unknown 下传 | A-13 | B-19 | arch |
| C10 | 派发/错误检查优先级：子命令>help 命令>default>action；"更好的错误"优先 | A-14 | B-15 | arch |
| C11 | hook 顺序：preAction root→leaf，postAction leaf→root，异步升级为 promise 链 | A-15 | B-14 | arch |
| C12 | action 处理器签名协议：声明参数→options→command（legacy 分支） | A-16 | B-31 | arch+design |
| C13 | executable 子命令外部化：命名约定+文件系统探测+平台 spawn+inspector 端口 | A-17, A-18 | B-13 | arch |
| C14 | mandatory/conflict 校验沿祖先链上行，叶子解析强制全局约束 | A-19 | B-16 | arch |
| C15 | optsWithGlobals 与来源查找同向：globals overwrite locals | A-20 | B-17 | arch |
| C16 | 双选项共享值键 + valueFromOption 值推断（implies/conflict 复用） | A-21, A-43 | B-09 | arch+risk |
| C17 | Help 渲染管线：configureHelp→Help 实例→formatHelp→后置 stripColor | A-22 | B-18 | arch |
| C18 | CJS 单实现 + ESM 薄包装（非双构建） | A-31 | B-20 | arch+design |
| C19 | command.js（~2777 行）是责任集中与变更热点 | A-23 | B-21 | critical |
| C20 | parseOptions 是语义密度最高的单函数（14.0.1 刚重写；自有歧义文档） | A-24, A-41 | B-25 | critical+risk |
| C21 | Help 类：公开扩展面 = 兼容契约；major 重构冲击下游子类 | A-25 | B-23 | critical |
| C22 | 值管线耦合点：addOption 单处理器汇聚 preset/parseArg/variadic/negate/source | A-28 | B-22 | critical |
| C23 | executable 机制环境耦合最重（OS/文件系统/signal）；专属测试簇为证 | A-29, A-44 | B-26 | critical+risk |
| C24 | 手写 typings 镜像 + tsd 校验 = 三类制品需同步（漂移风险） | A-39 | B-24, B-33 | critical+risk |
| C25 | 弃用目录 = 设计化兼容负担：旧路径存活于热代码，移除按 major | A-32, A-38 | B-29, B-34 | design+risk |
| C26 | 可重入 parse()：状态快照恢复；storeOptionsAsProperties 下禁止 | A-33 | B-32 | design |
| C27 | 颜色约定漂移：NO_COLOR/FORCE_COLOR 自实现且与生态有意识分歧 | A-45 | B-36 | risk |
| C28 | 发布模型风险：特性集中单线 + 12 个月窗口 | A-42 | （B-06 身份侧） | risk |
| C29 | 错误码/exitOverride 稳定性契约（测试声明 "intended to be stable"） | A-27, A-36 | （B-15 检查顺序侧） | critical+design |

*注：C28/C29 为"单边主题 + 对方相关主题"的强相关合并，记 partial-consensus。*

**共识核心（C01–C27 严格双命中）：27 个主题，覆盖全部五类，占比 27/47 ≈ 57%；含 partial-consensus 共 29 个，≈ 62%。**

### 分歧主题 —— 仅 A 收录（8 个）

| # | 主题 | 条目 | 性质判定 | 处置建议 |
|---|---|---|---|---|
| D-A1 | TS 是一等公民身份（含 extra-typings 推断层） | A-06 | 架构事实（identity 维度） | **收录**（B 在 critical 侧覆盖了同主题的制品面，身份面互补） |
| D-A2 | version 选项走注册路径 vs help 不走 | A-12 | 架构事实（C08 的对比补充） | **并入 C08** |
| D-A3 | 双选项配对三处独立重推导（negate/implied/conflict） | A-26 | 架构事实（热点归因） | **收录** |
| D-A4 | camelCase 键决策 → 共享槽模型 | A-34 | 设计决策（C16 的成因） | **并入 C16** |
| D-A5 | help 预格式化/boxWrap 尊重作者排版 | A-35 | 设计事实（可验证契约） | **收录** |
| D-A6 | ESM 手动枚举面漂移（exports map + 双 typings + import 测试） | A-40 | 风险判断（结构证据充分） | **收录**（B-20 覆盖架构未覆盖风险） |
| D-A7 | 建议引擎 suggestSimilar 在手写编辑距离（C02 的具体化） | （A-03 内含） | — | 并入 C02 |
| D-A8 | 严格双受众（终端用户严格 + 作者可扩展） | A-03 | 身份框架 | **并入 C04** |

### 分歧主题 —— 仅 B 收录（8 个）

| # | 主题 | 条目 | 性质判定 | 处置建议 |
|---|---|---|---|---|
| D-B1 | executable help 回退（父进程无法生成子帮助 → 传 --help 给子进程） | B-12 | 架构事实 | **收录**（A 未覆盖的高价值关系） |
| D-B2 | 非位置默认 + passThrough/positional 父子不变量（注册时 throw） | B-30 | 架构事实 | **收录** |
| D-B3 | v7 _optionValues 独立存储决策（属性冲突动机 + legacy 逃生舱约束） | B-27 | 设计决策 | **收录** |
| D-B4 | '--' 作为面向用户的歧义消解契约 | B-28 | 设计事实 | **收录** |
| D-B5 | EventEmitter 公开面弱类型 → 内部 emit 序列变化静默影响用户监听 | B-35 | 风险判断（机制已验证） | **收录**（风险类） |
| D-B6 | 派发决策树密度 + v7.1.0 回归史（证据化风险推理） | B-37 | 风险判断（非 bug 预测） | **收录** |
| D-B7 | program 单例状态累积风险（文档自身指引测试用 new Command） | B-38 | 风险判断 | **收录** |
| D-B8 | help 输出环境依赖（TTY 宽度/颜色 → 跨环境不确定性） | B-39 | 风险判断 | **收录** |

### 删除主题（规则违规或不可用）—— **2 个，全部来自合并层而非两方候选**

| # | 条目 | 删除原因 |
|---|---|---|
| X-1 | A-03 的 "suggestSimilar 算法细节（Damerau–Levenshtein, maxDist 3）" 独立形式 | 位置/算法事实，无关系承载；合并进 C02（手写实现是零依赖策略的后果） |
| X-2 | B-02 的 "package.json description + node>=20" 孤立表述 | 与 C05 重复且无关系负载；并入 C05 |

两方最终候选集本身 **0 条规则违规**（文件列表/纯位置/bug 预测全部被两方独立拒绝，见各 evaluator 的 rejected near-misses：文件计数、纯 file:line、bug 预测框架、"可见选项帮助掩蔽"等）。

## 3. 类别级一致性

| 类别 | 共识 | 单边（收录建议） | 一致性印象 |
|---|---|---|---|
| identity | C01–C05（5） | D-A1（收） | 高：核心身份维度双命中 |
| architecture_relation | C06–C18（13） | D-B1, D-B2（收），D-A2/D-A4 并入 | 最高：关系/流程类共识最强 |
| critical_component | C19–C24（6） | D-A3（收） | 高：热点判定趋同 |
| design_decision | C25, C26, C29 + 并入项 | D-B3, D-B4（收） | 中：单边设计条目最多，属正常（决策集大） |
| risk_surface | C16, C20, C23, C24, C25, C27, C28（7） | D-A6, D-B5–B8（收） | 高：风险区域（非 bug）双命中为主 |

## 4. 流程验证结论

1. **独立编制流程有效**：两方在无共享上下文下产出 84 条候选，27–29 个主题双命中，规则违规 0 条；被各自拒绝的条目类别高度重合（文件计数、纯位置、bug 预测）——说明 GT 规则本身可执行、可复现。
2. **"专家选自己认为重要的"偏差被结构化抑制**：分歧条目全部是**互补性**单边发现（A 偏 identity/设计成因，B 偏流程约束/风险机制），而非"同一事实的不同表述"——分歧可讨论、可仲裁，不需要删除。
3. **GUS 防知识考试规则起效**：84 条候选无一为"文件列举可作答"型；关系化表述（"A 依赖 B 且被 C 使用"、"顺序 cli>env>implied"）占绝对多数。
4. **建议的 Core GT v0.1 构成**：27 个严格共识主题 + 12 个单边收录（D-A1/A3/A5/A6 + D-B1/B2/B3/B4/B5/B6/B7/B8）+ 2 个并入项 → 约 **39 个主题**；按 GUS 权重配比检查：架构关系类 ≈ 15（40% 目标）、设计目的/约束 ≈ 12（45% 目标）、事实桶 ≈ 2–3（15% 上限内）——配比天然接近设计权重，无需人为凑数。

## 5. 裁决：是否允许进入正式 Experiment A

**允许（有条件）**。依据：
- GT 制定流程通过验证（独立性、规则合规、共识率 57–62% 对双人独立编制属健康区间）；
- Core GT v0.1 候选构成平衡、权重配比自然达标；
- 单边条目处置建议明确（12 收 2 并入 0 删），分歧可仲裁。

**前置条件（进入 Step 3 正式冻结前必须完成）**：
1. 双 evaluator 各自确认 Core GT v0.1 候选（39 主题的合并表述与证据锚）；
2. 单边条目按本报告处置表收录（任何一方可异议，异议 → ambiguous 不进主评分）；
3. `evaluation/cognition/cognition-gt.json` 按四类权重标注生成，sha256 锁定；
4. v1.1 lock（含 GT 输入）创建并 `--check` 通过；
5. 之后才允许 Step 4 正式 Experiment A 12-run。

**否决条件（若出现则重做校准）**：共识率 < 40%；任一类别 0 共识；GT 条目出现文件列举可作答型 ≥ 10%。

## 6. 产物

- `evaluation/cases/commander.js/gt-calibration/evaluator-A.json`（45 条原始候选）
- `evaluation/cases/commander.js/gt-calibration/evaluator-B.json`（39 条原始候选）
- `evaluation/cases/commander.js/gt-calibration/core-gt-v0.1.candidate.json`（39 主题合并候选，未锁定）
- 本报告
