# 来源可达性地图（Reachability Map）

> **为什么记这个**：采集管线的设计取决于"哪些域名到得了"。本环境存在硬性封锁，且**`web.archive.org` 不可达**——意味着**链接腐烂不可恢复**，每条透镜的 `collected` 日期是唯一留痕。
> 实测日期：2026-09（本轮）。

---

## 1. 不可达（会直接卡住采集）

| 域名 | 现象 | 后果 |
|---|---|---|
| `github.com` | DNS 解析到非公网 IP | **不能用网页抓取读源码/许可证** |
| `raw.githubusercontent.com` | 同上 | 同上 |
| **`web.archive.org` / `archive.org`** | 失败 | **没有 Wayback 兜底；链接腐烂不可恢复** |
| `martinfowler.com` · `dl.acm.org` · `queue.acm.org` | 403 | 模式文献只能靠其他路径 |
| `sre.google` | TLS 失败 | Google SRE Book 许可无法一手确认 |
| `medium.com` · `substack.com` · `muratbuffalo.blogspot.com` | 超时 | 部分一手经验源不可用 |
| `infoq.cn` · `zhihu.com`（专栏） | 403 | **中文源大面积不可用** |
| 微信公众号 | 验证码 | 同上 |
| `news.ycombinator.com` | HTML 抓不到 | **但 API 可用，见 §2** |
| `sourcegraph.com` | 403 防火墙 | — |

## 2. 可达，且是替代入口

### 2.1 GitHub 内容的三条替代路径

| 路径 | 形式 | 说明 |
|---|---|---|
| **`cdn.jsdelivr.net`** | `https://cdn.jsdelivr.net/gh/<owner>/<repo>@<ref>/<path>` | **主替代**。已验证可取回任意 GitHub 文件原文（含 LICENSE） |
| `codeberg.org` | Forgejo，带 RSS + API | k8s.af 的上游已迁至此 |
| `gitee.com/mirrors` | 2.8 万+ GitHub 镜像 | 中文线路兜底 |

> **注意**：`fastly.jsdelivr.net` 同样可用；`gcore.jsdelivr.net` 与 `testingcf.jsdelivr.net` **SSL 失败**。
> jsdelivr 对部分仓库会 302 到 `raw.githubusercontent.com`（若用不跟随重定向的抓取器即失败）；**用会跟随重定向的客户端则成功**。
> **限流**：约 6–10 次请求后触发，需镜像轮换 + backoff。

### 2.2 发现层必须走 API / JSON feed，不走网页

| 源 | 端点 | 用途 |
|---|---|---|
| Hacker News | `https://hn.algolia.com/api/v1/search?query=...&tags=story` | HN 站点 HTML 抓不到，**API 可用** |
| Lobsters | `https://lobste.rs/hottest.json` | 高信号讨论 |
| Increment | `https://increment.com/feed.xml` | 全文 feed |
| 美团技术团队 | `https://tech.meituan.com/rss.xml` | 全文 feed |
| 阮一峰 | `https://ruanyifeng.com/blog/atom.xml` | 全文 feed（**注意 CC BY-NC-ND，禁演绎**） |
| 酷壳 | `https://coolshell.cn/feed` | 全文 feed |
| Dan Luu | `https://danluu.com` | 完整博客索引 |

### 2.3 直接可达的高信号资产

`learn.microsoft.com`（Azure Cloud Design Patterns / Antipatterns / Saga）· `microservices.io`（**All rights reserved**）· `cwe.mitre.org` · `csrc.nist.gov` · `owasp.org` + `cheatsheetseries.owasp.org` · `reactive-streams.org` · `12factor.net` · `docs.aws.amazon.com` · `jepsen.io/analyses` · `postgresql.org/docs/current/transaction-iso.html` · `vitess.io` · `opentelemetry.io` · `brendangregg.com/usemethod.html` · `rfc-editor.org` · `kubernetes.io` · `modelcontextprotocol.io` · `k8s.af` · `semver.org`

---

## 3. 对本项目管线的硬性结论

1. **发现层 = API + JSON feed 优先**，不做网页抓取。
2. **每条透镜强制记 `collected` 日期**——没有 Wayback 兜底。
3. **不要依赖外链的存活**。典型例证：`danluu/post-mortems` 索引中**约 30–40% 的条目外链指向 archive.org，在本环境永久不可取** → **只能引用条目自带的内联注解，不得依赖其外链**。
4. **`collected` 是唯一留痕**，因此也是复审（freshness）的唯一锚点。
