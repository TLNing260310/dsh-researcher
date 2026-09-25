# 透镜库（Lens Library）— 索引

> **状态**：v0.1 骨架。首批透镜正在从**许可干净的来源**重建（见 §2）。
> **规范**：本目录是 `dsh-researcher` 研究模式的**注意力路由知识库**。它是**数据资产**，不是代码。

---

## 1. 这个库是什么

研究模式的瓶颈不是"模型不够聪明"，是**注意力落点**（本项目自身评测已证：Flask 的 Issue Recall `0/60`，归因是 GT 落在"所有模式注意力之外"）。

透镜库解决的是：**面对一个任务，模型应该从哪几个方向去"反着看"。**

一条**透镜（lens）**是一个可复用的审查视角，回答"要看什么、什么会崩、缺了什么、假设了什么"。

---

## 2. 两个目录，按许可分级分开

| 目录 | 内容 | 可再分发 | 许可 |
|---|---|---|---|
| **`clean/`** | 从**许可干净**的来源重建的透镜（规范、公有领域、CC-BY、Apache） | ✅ **可以随本仓库分发** | 各条目单独标注 |
| **`paraphrase-only/`** | 来源为 **All rights reserved / 禁演绎** 的透镜线索 | ❌ **只存链接与线索，不存内容** | 见各文件头 |

**这不是形式主义。** 它决定了这个库能不能随 MIT 项目分发：

- `clean/` 的每条透镜必须能追溯到**允许再分发**的原始来源
- `paraphrase-only/` 里的条目**不得**包含第三方文本或紧贴原文的改写，只允许「来源名 + 我们自己的检查问题 + URL」

安全实践（硬规则）：**仓库内只存链接 + 结构化 metadata + 我们自己的 paraphrase；第三方全文、长引文、第三方 embedding 一律不入库。**

---

## 3. 透镜的六字段模式

每条透镜必须六字段齐备，缺一不可入库：

```yaml
lens: MP-2                                  # 域前缀 + 序号
name: 能力矩阵 vs 最大公约数
domain: multi-provider-adaptation
trigger: 仓库中出现 ≥2 个 model provider，或自建 LLMClient/provider/adapter 抽象
questions:                                  # 必须能用 path:line 回答；必须是肯定式
  - 是否存在显式能力矩阵？
  - 不受支持的参数是抛错、静默降级、还是静默丢弃？给出那一行。
failure_modes:                              # 具名 + 有 primary source
  - 静默能力丢弃 = 静默正确性降级
alternatives:                               # 候选替换项 + 买到什么 / 代价是什么
  - 显式能力矩阵 + 强校验：买到失败前移；代价是新增 provider 必须补矩阵
evidence_anchors: [capability-matrix, normalization-table]
sources: [{ title: ..., url: ..., license: ... }]
provenance: { collected: 'YYYY-MM', verified_by: ..., freshness: 'YYYY-MM' }
```

### 两条写法硬规则

1. **问题必须写成肯定式、可验证的形式。** 依据：LLM 对否定系统性不敏感（arXiv:2306.08189）——**"不要做 X"是最弱的约束形式**。
2. **不得写没有 primary source 的"具名模式"。** 禁止清单见 §4。

---

## 4. 禁止作为具名模式使用的"民间传说"

以下术语**未找到 primary source**，只能作为现象描述，不得作为命名模式入库：

`thundering herd` · `cache stampede` · `correlated failure` · `backpressure collapse` · `certificate expiry` · `bimodal performance` · **`the millstone`（该术语根本不存在）**

反之，有 primary source、**可以**作为具名模式使用的：

| 模式 | 来源 |
|---|---|
| Metastable failure | Bronson et al., HotOS '21, DOI `10.1145/3458336.3465286` |
| Gray failure | Huang et al., HotOS '17, DOI `10.1145/3102980.3103005` |
| Coordinated omission | Gil Tene, QCon SF 2012；Schroeder et al., NSDI 2006 |
| 复杂系统失败 18 条 | Cook, *How Complex Systems Fail* |
| 构建系统注入式供应链后门 | CVE-2024-3094 |

---

## 5. 路由要用到的最小元数据

透镜库是**被路由的**，不是被全文注入的。路由只需要每条透镜的：

```yaml
tags:
  structure: [plugin-host, sync-call-chain]     # 结构信号，权重 2
  symptom:   [silent-field-drop, version-skew]  # 症状信号，权重 2
  stack:     [node, python]                     # 权重 1
  store:     [postgres, redis]                  # 权重 1
```

闭集标签词表见 `tags.yml`。

---

## 6. 注入纪律（借鉴自生态实践）

| 规则 | 出处 |
|---|---|
| **只有显式门禁能决定"要不要查"**；其余信号只用于**选哪条** | `dsh-company-kb` 的显式调用门禁 |
| **低于精度阈值的透镜不注入**，进 `unassessable` 而非硬塞 | `twiceshy`：绝不注入"近似但错误"的经验 |
| 注入**透镜 ID + 检查问题**，不注入正文；正文按需经 `skill` 工具加载 | `dsh-experience-memory`：无条件指引仅 204 字节 |
| 拒绝注入时，**明确告知模型不要反复询问** | `dsh-company-kb` 的 `REFUSAL_TEXT` |
| 触发器优先"**挣扎**"而非"未命中"——未命中信号太廉价 | `dsh-learn-wiki` 实测结论（该插件已把 `gapTrigger` 默认设为 `struggle`） |

---

## 7. 维护

- **复审周期**：规范型 6 个月 · 模式型 12 个月 · 经验型 12 个月
- **过期降权**，标 `STALE`，**绝不静默删除**（tombstone 保持可引用性）
- **记录 `collected` 日期是强制项**——本环境 `web.archive.org` 不可达，**链接腐烂不可恢复**，日期是唯一留痕
