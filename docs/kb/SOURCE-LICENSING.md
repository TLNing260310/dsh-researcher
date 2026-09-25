# 来源许可分级（Source Licensing Tiers）

> 这份表决定**哪些内容能随本仓库（MIT）分发**。入库时必须标注级别。
> 最后核实：2026-09。

---

## 分级

| 级别 | 含义 | 可否入 `clean/` | 可否入 `paraphrase-only/` |
|---|---|---|---|
| `public_domain` | 公有领域 | ✅ | — |
| `permissive` | MIT / Apache-2.0 / BSD | ✅ | — |
| `attribution` | CC-BY-* | ✅（需署名） | — |
| `sharealike` | CC-BY-SA-* | ✅ **注意传染**：衍生作品需同许可 | — |
| `noncommercial` | CC-BY-NC-* | ⚠️ 非商业可用 | ✅ |
| `noderivatives` | CC-BY-ND-* | ❌ | ✅（**仅链接与事实，禁改写**） |
| `all_rights_reserved` | 保留所有权利 | ❌ | ✅（**仅链接 + 我们自己的措辞**） |
| `unknown` | 无 LICENSE / 未确认 | ❌ **按 `all_rights_reserved` 处理** | ✅ |

---

## 已核实的资产分级

### ✅ 可再分发（可入 `clean/`）

| 资产 | 许可 | 备注 |
|---|---|---|
| NIST SSDF SP 800-218 | **公有领域** | 零许可风险 |
| CWE 4.20 | **MITRE 免费条款** | XML + XSD + CSV + REST API，900+ 条 |
| OWASP ASVS 5.0.0 | **CC-BY-SA-4.0** | ⚠️ ShareAlike 传染；官方 CSV + 稳定 ID |
| Google eng-practices | **CC-BY-3.0** | |
| Google AIP | **CC-BY-4.0** | |
| Marc Brooker 博客 | **CC-BY-4.0** | |
| PagerDuty incident/postmortem 文档 | **Apache-2.0** | 明确允许商用与修改 |
| 凤凰架构（周志明） | **CC-BY-NC-SA-4.0** | ⚠️ **NC：不可商用** |
| PostgreSQL / Kubernetes / RFC / OpenTelemetry / Reactive Streams / semver.org | 各自开放条款 | 引用与提炼安全 |

### ❌ 禁止再分发（**只能入 `paraphrase-only/`**）

`microservices.io`（**All rights reserved**，另有官方中文版 `/patterns/cn/`）· `refactoring.guru` · `12factor.net` · `martinfowler.com` · `SEI`（需书面许可）· 美团技术 · 腾讯云 · 阿里云社区

### ⛔ 禁演绎（**只能当线索**）

`阮一峰博客` — **CC BY-NC-ND 3.0**：可链接、可引用事实，**不可改写**。**此类来源与我们的"蒸馏改写"工序直接冲突**，透镜正文必须另行取证。

### ⚠️ 需进一步确认

Google SRE Book 的确切许可字符串（`sre.google` 在本环境 TLS 失败，无法一手确认）；全部 GitHub 托管工具的许可（经 `cdn.jsdelivr.net` 可读单个仓库的 LICENSE）。

---

## 安全实践（硬规则）

> **仓库内只存链接 + 结构化 metadata + 我们自己的 paraphrase。**
> **第三方全文、长引文、第三方 embedding 一律不入库。**

需要原文时，由运行时在**用户侧**抓取，结果**不落库**。

这条同时解决两个问题：版权，以及"透镜库退化成过期博客堆"。

### 三层切分（唯一能在许可变化时仍正确的结构）

| 层 | 位置 | 内容 | 可再分发 |
|---|---|---|---|
| **T0 随附** | repo + release artifact | 透镜 ID、域、检查问题（**我们自己的措辞**）、来源 URL、标题、作者、日期、许可标识、`collected` | ✅ |
| **T1 构建期** | `.cache/`（gitignored），用户机器 | 抓取正文、抽取文本、embedding | ❌ **绝不 commit** |
| **T2 运行时** | 用户机器 | 实时重抓、新鲜 embedding | ❌ |

---

## 一处必须修正的引用错误

**文本与数据挖掘（TDM）的 opt-out 条款在 `DSM Directive (EU) 2019/790 Art. 4(3)`，不在 EU AI Act Art. 4**（后者是 AI literacy）。

补充：`aipref` 的 `search` 类别**明确排除 summaries** —— 因此"我们只是做索引"这句话**不覆盖 LLM 摘要**；蒸馏层很可能需要 `ai-use` / `ai-input` 许可。这是"分析留在用户侧"的另一条独立理由。
