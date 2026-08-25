# 安装、校验与恢复

安装器管理两个固定目标：`researcher` 与 `governed`。所有平台都由同一个 Node.js 入口执行，因此 PowerShell、Bash 和 npm release artifact 具有相同的预检、备份与回滚语义。

> **包身份边界**：本项目没有发布到 npm registry。未加 scope 的 npm 包 `dsh-researcher` 指向另一位维护者的另一个仓库，与本项目无关。只使用 README 中固定到 `github:TLNing260310/dsh-researcher#<tag>` 的命令，或校验过 SHA-256 的 GitHub Release 制品。`main` 的 package metadata 使用私有 scoped identity `@tlning260310/dsh-researcher`，用于防止误发布，而不是 npm 可用性声明。现有 `v0.8.0-alpha.8` tag 早于该 metadata 调整；固定的 `github:` source 仍只解析本仓库。

## 支持边界

- Node.js：`>=22.12.0`
- 目标 DeepSeek Harness：精确版本 `0.1.1-rc.2`（隔离 Gate 0/live conformance 尚待完成）
- DSH 运行时 Node：`^22.19.0 || >=24.0.0`；低于该范围的安装会 fail closed
- 默认安装先自行解析 `PATH` 中第一个绝对路径 DSH 命令；空项和相对路径会被忽略，避免在不可信仓库中执行同名文件。可直接安全启动的命令会运行 `--version`；Windows npm 的 canonical `.cmd` / `.bat` shim 不经 shell 执行，而是要求完整结构与实际调用目标匹配，再校验邻近 `@deepseek-ai/dsh` 的包名、`dsh` bin 声明与精确版本。注释或无关命令中出现包路径不会通过。其他 shim 格式（包括只有 `.ps1`）须改用显式 `--dsh-package`。后续 PATH 项或无关 npm global package 不能替第一个命中项背书。
- 若 `dsh` 根本不在 `PATH`，自动 metadata fallback 会拒绝；它不会用一个无法调用的全局包冒充可用 CLI，也不会信任当前工作目录里的同名文件。
- 自动定位不可用时，可传入绝对路径 `--dsh-package <package.json>`。该文件必须是真实普通文件，所在包目录不能是符号链接，且 `name` 必须精确为 `@deepseek-ai/dsh`。
- 找不到可信元数据、元数据不可读、CLI 明确报告其他版本或版本不精确匹配时，安装会在写入前拒绝。
- `--allow-unsupported-dsh` 是显式的不安全覆盖：它只允许隔离测试，不会把未知运行时变成“已认证”。

先运行无写入预检：

```powershell
.\install.ps1 install --dry-run
```

```bash
./install.sh install --dry-run
```

预检通过后，去掉 `--dry-run` 执行安装。默认操作就是 `install`，所以省略该单词仍兼容旧用法。

这里的“无写入”只承诺 **installer-owned paths 零写入**：安装器不会创建或修改 `.agent-presets`、`.dsh-researcher`、备份、stage 或 lifecycle lock。自动版本检查可能启动外部 `dsh --version`；若该外部程序自身具有日志、遥测或其他副作用，那不属于安装器能够证明的零写入边界。需要完全避免启动 DSH 时，可用 `--dsh-package <absolute-package.json>` 只读校验包元数据。

## 从精确 release artifact 安装

在 GitHub Release 页面下载同一版本的三个资产：

- `dsh-researcher-<version>.tgz`
- `package-manifest.json`
- `SHA256SUMS`

不要把 GitHub 自动生成的 “Source code” 压缩包当作发布制品；它不受 `package-manifest.json` 的 npm 包清单约束。

PowerShell 校验：

```powershell
$artifact = '.\dsh-researcher-<version>.tgz'
$actual = (Get-FileHash -Algorithm SHA256 $artifact).Hash.ToLowerInvariant()
$manifest = Get-Content -Raw '.\package-manifest.json' | ConvertFrom-Json
if ($actual -ne $manifest.package.sha256) { throw 'tarball SHA-256 mismatch' }
$manifestHash = (Get-FileHash -Algorithm SHA256 '.\package-manifest.json').Hash.ToLowerInvariant()
$expectedManifestHash = ((Select-String -Path '.\SHA256SUMS' -Pattern '\*package-manifest\.json$').Line -split '\s+')[0]
if ($manifestHash -ne $expectedManifestHash) { throw 'package-manifest SHA-256 mismatch' }
```

Unix 校验：

```bash
sha256sum --check SHA256SUMS
```

校验成功后，直接从已下载的本地 tarball 运行，不再解析浮动的分支或标签：

```powershell
npm exec --yes --package='.\dsh-researcher-<version>.tgz' -- dsh-researcher install --dry-run
npm exec --yes --package='.\dsh-researcher-<version>.tgz' -- dsh-researcher install
```

```bash
npm exec --yes --package='./dsh-researcher-<version>.tgz' -- dsh-researcher install --dry-run
npm exec --yes --package='./dsh-researcher-<version>.tgz' -- dsh-researcher install
```

如需复现实验性的不兼容运行时测试，必须显式追加 `--allow-unsupported-dsh`；输出会标注 `UNSAFE OVERRIDE` 和 `NOT certified`。

若 `dsh --version` 在已知的固定版本安装中返回空值，可显式绑定安装元数据后预检：

```text
dsh-researcher install --dry-run --dsh-package <absolute-path-to-@deepseek-ai/dsh/package.json>
```

`--dsh-package` 是元数据来源绑定，不是忽略版本检查；错误包名或错误版本仍会被拒绝。

## 安装生命周期

下列示例使用已安装的 `dsh-researcher` 命令；也可以继续用上面的 `npm exec --package=<local-tarball> -- dsh-researcher ...`。

```text
dsh-researcher backup
dsh-researcher uninstall --dry-run
dsh-researcher uninstall
dsh-researcher rollback --dry-run
dsh-researcher rollback
dsh-researcher rollback --backup-id <id>
```

- `install` 在任何修改前创建快照。首次安装也会记录“两项目标原本不存在”，因此可以回滚到未安装状态。
- 已存在任一目标时，`install` 默认拒绝；`--force` 会先备份，再替换两个目标。
- `backup` 同时记录目标存在与不存在的状态，避免回滚时遗留半套 preset。
- `uninstall` 先创建完整快照，再删除两个受管目标；备份不会随卸载删除。
- `rollback` 默认恢复最新完整快照，也可用 `--backup-id` 精确选择；恢复前会再次备份当前状态，所以回滚本身可撤销。
- `.complete.json` 缺失、损坏、状态与目录矛盾的快照会被拒绝。
- 目标、备份或状态根若是符号链接、junction 或普通文件，安装器会 fail closed，避免递归删除越过受管边界。
- 安装源、组合后的 stage 和恢复 stage 都会进行内容树清单检查；嵌套 symlink、junction 与特殊文件会在替换前被拒绝。
- stage 与 `.agent-presets` 必须位于同一 filesystem device。安装器会在删除任何既有目标前验证这一点，避免 `rename` 因 `EXDEV` 形成“先删后失败”。
- 备份完成后、首次删除前，安装器会再次逐文件哈希两个目标；若 DSH、编辑器或其他进程在这段时间修改了 preset，操作会在替换前中止。生命周期锁只能串行化本安装器，不能锁住外部编辑者，因此升级、卸载和回滚时仍应停止使用这些 preset。

快照保证的是受管目录的文件字节、SHA-256 和目录结构一致性。它**不承诺**保留 ACL、xattr、owner、mtime、平台专属文件标志或其他文件系统元数据；如果这些属性对环境有意义，应同时使用平台原生备份工具。

### 生命周期互斥锁

所有会写入 installer-owned paths 的 `install`、`backup`、`uninstall`、`rollback` 都先以原子 exclusive-create 获取：

```text
${DSH_HOME:-~/.dsh}/.dsh-researcher/lifecycle.lock
```

已有锁会立即拒绝第二个 writer。安装器不会根据时间或 PID 自动删除“看似过期”的锁，因为错误清锁可能允许两个修改者并发删除/替换同一目标。进程异常退出留下锁时：

1. 读取锁文件中的 `action`、`pid` 和 `created_at`；
2. 由用户确认对应安装器进程确实已经结束；
3. 先备份当前 `DSH_HOME`；
4. 只手工删除上面这个精确的 `lifecycle.lock`，再重试。

`--dry-run` 不创建、更新或清理 lifecycle lock；即使发现旧锁，也只进行只读预检。

备份位于：

```text
${DSH_HOME:-~/.dsh}/.dsh-researcher/backups/<backup-id>/
```

`uninstall` 只移除：

```text
${DSH_HOME:-~/.dsh}/.agent-presets/researcher
${DSH_HOME:-~/.dsh}/.agent-presets/governed
```

它不会删除备份，也不会删除其他 preset。确认不再需要恢复后，备份保留策略由用户自行决定。

## 失败与人工恢复

替换过程中发生错误时，安装器会尝试从操作前快照恢复。若自动恢复也失败，它会同时报告原始错误和恢复错误，并保留备份；此时不要继续使用 `--force`，应先复制整个 `DSH_HOME`，再检查目标路径、磁盘空间和权限。
