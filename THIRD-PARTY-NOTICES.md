# 第三方声明（Third-Party Notices）

> 本文件列出 `dsh-researcher` 参考、借鉴或接入的第三方作品及其许可。
> **凡是接入代码或内容的，必须在此登记，并保留原许可全文。**

---

## 1. 本次接入的 DSH 生态插件（均为 MIT）

本项目的**注意力路由、注入纪律与知识库检索**设计借鉴了以下项目。**思路与治理机制**的借鉴已在 README 的「致谢与致敬」一节公开说明。

### 1.1 dsh-company-kb — MIT

- 仓库：https://github.com/wu81313-lab/dsh-company-kb
- 版权：Copyright (c) 2026 wu81313-lab
- 借鉴内容：
  - **显式调用门禁**的三条放行线索（会话粘性 / 触发词 + 否定窗口 / 路径点名）——我们的第一级触发采用同一原则
  - **双 FTS5 + RRF 融合检索**（词级 BM25 与 trigram 子串两路，只融合名次避免量纲相加）
  - **拒绝注入时的说明文本**：明确告知模型"不要反复询问"——防止注意力被无用往返污染
  - `currentDirectUserText`：从会话日志取"直接用户消息"、排除插件注入内容，避免自己触发自己
- 许可全文见 `licenses/dsh-company-kb-LICENSE.txt`

### 1.2 dsh-experience-memory — MIT

- 仓库：https://github.com/Marquez807/dsh-experience-memory
- 版权：Copyright (c) 2026 Marquez807
- 借鉴内容：
  - **四表面模型**（自动注入 / 无条件一行指引 / 维护 / 工具与命令）——按"触发者"划分注入面
  - **工具与命令的划分纪律**：会够到库外、或会批量写入的能力，留在**人类触发器**之后
  - **极简注入预算**：无条件指引仅 204 字节
  - **provenance audit**：引用的文件消失时**只标记 `needs_review` 并报出缺失文件，从不拒绝**——直接对应我们的透镜新鲜度机制
  - **启动日志打印 store 路径与记录数**：因为"空 store 与错误 store 从外面看完全一样"
- 许可全文见 `licenses/dsh-experience-memory-LICENSE.txt`

### 1.3 dsh-learn-wiki — MIT

- 仓库：https://github.com/Dayi-Z/dsh-learn-wiki
- 版权：Copyright (c) 2026 Dayi-Z
- 借鉴内容：
  - **触发器从"检索未命中"改为"挣扎"**的一手实测结论：未命中信号太廉价（任何新话题都会未命中），默认应关闭。**这条实测否决了我们的第一版触发设计。**
- 许可全文见 `licenses/dsh-learn-wiki-LICENSE.txt`

### 1.4 dsh-literature — MIT

- 仓库：https://github.com/amphilagus/dsh-literature
- 版权：Copyright (c) 2026 amphilagus
- 借鉴内容：**专用 preset 承载专用工具集**的组织方式（标准编码 Agent 默认不加载该工具集）。
- 许可全文见 `licenses/dsh-literature-LICENSE.txt`

### 1.5 deepseek-harness — MIT

- 仓库：https://github.com/deepseek-ai/deepseek-harness
- 版权：Copyright (c) 2026 DeepSeek
- 关系：**本项目的运行时宿主**。本项目是其插件/预设生态的一部分，不复制其源码。

---

## 2. 仅借鉴思路、**未接入任何代码或内容**的项目

以下项目因**许可不兼容**而不予接入。我们只阅读其公开文档与设计说明，吸收思想，**不复制任何代码、文本或数据**。

### 2.1 twiceshy — AGPL-3.0（不兼容）

- 仓库：https://github.com/dotts-h/twiceshy
- **不接入原因**：AGPL-3.0 具强传染性，接入将迫使本项目整体改为 AGPL，**摧毁 MIT 分发**。
- 仅吸收以下**思想**（思想不受版权保护）：
  - **"绝不注入近似但错误的经验"**——为检索精度设硬门槛，宁可少注入
  - 记录结构 `{症状, 适用范围, 根本原因, 防护测试}` 与本项目透镜六字段的对应关系
  - **推送（决策时刻自动注入）+ 拉取（工具按需检索）**的混合通道

### 2.2 dsh-context-mode — Elastic License 2.0（不兼容）

- 仓库：https://github.com/icanfinish11/dsh-context-mode
- **不接入原因**：ELv2 禁止"将软件修改后提供给第三方"，与"改造后随 MIT 项目分发"直接冲突；且其核心逻辑位于同许可的 `context-mode` 依赖中。
- 本项目**不需要**它解决的问题（上下文预算）——研究模式的瓶颈是注意力落点，不是 token 容量。

---

## 3. 透镜库使用的权威来源

透镜内容**不复制**下列来源的文本，只提炼**事实**并配以**我们自己的检查问题**。来源与其许可分级见 `docs/kb/SOURCE-LICENSING.md`。

| 来源 | 许可 |
|---|---|
| CWE（cwe.mitre.org） | MITRE 免费条款 |
| OWASP Top 10 / Cheat Sheet Series | CC-BY-SA-4.0（**ShareAlike**） |
| NIST SP 800-207 / SSDF SP 800-218 | 公有领域 |
| AWS Well-Architected Framework | AWS 条款 |
| Azure Cloud Design Patterns / Antipatterns | Microsoft 条款 |
| PostgreSQL / Kubernetes / Prometheus / OpenTelemetry / RFC Editor 文档 | 各自开放条款 |
| Reactive Streams / semver.org | 各自开放条款 |

---

## 4. 登记规则

1. **任何接入的代码或内容都必须在本文件登记**，并附许可全文于 `licenses/`。
2. **AGPL / GPL / Elastic License 一律不接入**——它们与本项目的 MIT 许可不兼容。
3. **无 LICENSE 文件的第三方作品按 All rights reserved 处理**，不得接入。
4. **只借鉴思想不构成接入**，无需许可全文，但仍应在 README 致谢中说明。
