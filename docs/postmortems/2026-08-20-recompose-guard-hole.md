# Postmortem: recompose guard hole (2026-08-20)

## 现象

首次真实研究会话（session-976cc214）经日志取证发现：工具集是 researcher 的（git_read、research_checkpoint 正常使用），但 **write/edit 是真实 schema 而非永拒桩、沙箱是 danger-full-access、环境预检从未执行**。该次零修改由 persona 自觉维持，而非四层机制。

## 根因

```
session 创建（preset=minimal）
        ↓
agent/created 事件触发（minimal 的 standing mount，无守卫插件）
        ↓
用户切换预设 → recompose（agent 加入 researcher 的 standing mount）
        ↓
tool-restrict 的 agent/created 监听器在切换后才注册
        ↓
事件已错过 → 桩 / 指引遮蔽 / 环境预检全部未安装
```

**声明状态 = researcher；运行状态 = minimal 工具面 + danger-full-access。配置正确 ≠ 运行正确。**

## 教训（通用 Agent 工程原则）

事件驱动的初始化假设"初始化先于使用"，但动态组合路径（preset reload / hot swap / session resume / recompose / plugin lifecycle）全部可以打破这个假设。**守卫必须绑定到 scope 层（执行时裁决），不能只绑定到创建时事件。**

## 修复

- **v0.4.4**：standing-scope `tools.guard`（层级生效，与事件时序无关）——write/edit 永远拒绝；环境在首次调用时验证，不通过则拒绝一切（fail-closed at first use）。
- **v0.5.0**：`research_doctor` 把同类问题变成可检测项——证书的 Write tools 检查机械验证"桩而非真实 schema"，Preset 检查读活 scope 链，可当场捕获 recompose 路径。
- **v0.5.1**：健康门禁——doctor 成为强制第一步（非 doctor 工具在证书产出前全部拒绝），把"隐式假设"变成"显式证明"。

## 留档价值

这是本项目自己的 Fixture 0：机制承诺必须被真实运行验证，且这个案例本身证明了本项目的核心论点——**"系统关于自己的描述"与"系统实际状态"的漂移**，发生在被研究的项目上，也曾经发生在本项目自己的守卫上。
