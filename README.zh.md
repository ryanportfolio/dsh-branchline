# DSH Branchline

[English](README.md) | 简体中文

DSH Branchline 是面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的人工操作 Git worktree 任务工作台。它会先 fetch `origin`，解析远程仓库当前的默认分支，再从该分支的精确 commit 创建任务。独立 checkout 随后会作为原生 DSH Workspace 与 Session 打开。

插件不注册模型工具，不修改 System Prompt，也不增加工具 Schema。工作台和 `/worktree-studio` 命令都不进入模型上下文，因此安装后不会增加 Prompt token，也不会改变前缀缓存行为。

## 界面截图

![Worktree 任务工作台](assets/worktree-board.png)

![验证与交付检查](assets/worktree-delivery.png)

## 适用场景

当用户希望同时打开并监督多个隔离编码会话，并由自己掌握最终交付决定时，可以使用 Branchline。它不是子代理编排器：插件负责创建检出目录和 Session，具体工作由用户或已有 Agent 工作流决定。

- 一个任务对应一个分支、linked worktree、DSH Workspace 和 Session。
- Base ref 留空时使用刚刚 fetch 的 `origin` 默认分支；特殊任务仍可显式指定 base ref。
- 侧边栏工作台集中显示多个仓库的提交、暂存、未暂存和未跟踪状态。
- 改动审阅包含有界 diff、stat 摘要和未跟踪路径。
- 验证结果绑定 SHA-256 token；token 覆盖 HEAD、Git 状态、tracked diff 字节和未忽略的 untracked 文件内容。
- 合并预检使用 `git merge-tree`，不修改目标 checkout 或 index。
- 默认关闭本地交付。任务分支会保留，供审阅和外部集成。
- 归档保留任务记录；丢弃必须明确确认任务 ID。
- 原子状态写入、跨进程变更锁和启动恢复标记会暴露中断操作。

## 环境要求

- DeepSeek Harness `0.1.0-rc.7` 或兼容的 `0.1.x` 版本。
- 带标准本地 subprocess provider 的 DSH Web profile。
- Node.js `22.19.0` 或更高版本。
- 支持 `merge-tree --write-tree` 的 Git；建议使用 Git 2.38 或更高版本。
- 至少包含一个提交的本地 Git 仓库。

## 安装

npm 包发布后安装预构建版本：

```sh
dsh plugin --profile web add dsh-branchline
dsh web
```

npm 发布前可以安装仓库构建：

```sh
dsh plugin --profile web add github:ryanportfolio/dsh-branchline
dsh web
```

本地开发时，在插件 checkout 中执行：

```sh
pnpm install
pnpm run build
dsh plugin --profile web add .
```

安装后，Web 侧边栏底部会出现 Worktree 任务入口。移除插件不会删除已管理的 worktree 或状态文件：

```sh
dsh plugin --profile web remove dsh-branchline
```

## 工作流程

1. 打开 **Worktree 任务**，选择已注册的仓库并新建任务。
2. Branchline 运行 `git fetch origin --prune`，读取远程仓库声明的默认分支，并记录对应的 remote-tracking commit。然后在 managed root 下从该 commit 创建 `dsh/<task>-<id>`。所选仓库的分支、index 和工作文件不会改变。
3. 插件把新路径注册为 DSH Workspace，在其中启动 Session，然后关闭工作台。
4. 在该 Session 中完成并提交改动。工作台会报告 committed、staged、unstaged 和 untracked 状态。
5. 使用 **查看改动** 检查有界 diff。**合并检查** 仍可用于本地兼容性检查。
6. Review-only 模式保留分支和 worktree。通过常用 GitHub 流程推送或集成该分支。
7. **归档** 会移除干净的 linked worktree 并保留记录。**丢弃** 只有在独立风险确认和 Host 端精确任务 ID 确认后，才会强制移除 checkout。

在 **起点引用（可选）** 中输入值，可以为单个任务跳过远程默认分支解析。例如，`origin/release` 会直接使用该本地 ref，不先 fetch `origin`。

## 命令

人工命令在本地处理，不会发给模型：

```text
/branchline list
/branchline create <title>
/branchline inspect <id>
/branchline validate <id> <command...>
/branchline preview <id>
/branchline deliver <id>
/branchline archive <id>
/branchline recover
```

丢弃只在 Web 工作台提供，因为那里会展示风险确认。命令使用当前 Session workspace 作为仓库或交付目标。

## 配置

Bundle 会插入使用 Schema 默认值的 Host 和命令条目。部署需要修改路径或限制时，在 Web profile 最后应用的 `cordis.patch.yml` 中覆盖 `dsh-branchline` 条目。

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `managedRoot` | `$DSH_HOME/plugins/dsh-branchline/worktrees` | 插件创建 worktree 的父目录。 |
| `statePath` | `$DSH_HOME/plugins/dsh-branchline/tasks.json` | 原子 JSON 任务状态；不得位于 `managedRoot` 内。 |
| `gitTimeoutMs` | `60000` | 单次 Git 操作的截止时间。 |
| `terminationGraceMs` | `3000` | 受管进程树从 TERM 升级到 KILL 的等待时间。 |
| `validationTimeoutMs` | `600000` | 单次验证命令的截止时间。 |
| `maxOutputBytes` | `1048576` | Git 诊断和验证各输出流保留的最大字节数。 |
| `reviewMaxBytes` | `524288` | 审阅时保留的 diff 和未跟踪路径最大字节数。 |
| `requireValidation` | `true` | 交付前要求验证通过且结果绑定当前内容 token。 |
| `allowDelivery` | `false` | 显示并允许本地合并交付。通过其他流程审阅或集成分支时应保持关闭。 |

Host 加载时会解析相对路径。空路径、非正数限制，以及位于 managed worktree root 内的状态文件都会导致插件启动失败。

## 安全模型

Host 路由只接受 loopback 连接、loopback `Host` authority 和同源浏览器标记。它是执行边界，不是身份认证：以同一用户运行的本地进程仍可访问 loopback 服务，就像它可以直接运行 Git 一样。

Git 和验证命令通过 DSH 的受管 subprocess 服务运行。插件只传入启动程序所需的少量白名单环境变量，再为 Git 加入非交互变量，或为验证加入 `CI`。Token 和 secret 变量不会被传给子进程；POSIX 保留 `SSH_AUTH_SOCK`，让 Git 使用用户已配置的 agent。Provider 管理完整进程树，升级终止超时进程，并等待进程树退出。

启用 `allowDelivery` 后，交付仍不信任浏览器结果。Manager 会跨进程序列化变更，检查当前内容 token，要求任务改动已提交，在启用时核对验证 token，执行新的合并预检，持久化 pending operation，并在 `git merge` 前再次检查目标 HEAD 和干净状态。

如果合并失败后无法确认目标已恢复到原 HEAD 和干净状态，任务会进入 `recovery-needed`，而不是报告普通冲突。`recover` 会核对持久化标记与 Git worktree metadata，但不会删除身份不明的路径。

漏洞报告和信任假设见 [SECURITY.md](SECURITY.md)，状态与生命周期细节见 [docs/architecture.md](docs/architecture.md)。

## 当前限制

- Branchline 只管理本地仓库，不推送分支，也不创建 Pull Request。
- 交付合并已提交改动，不会把未提交 working tree 复制到目标 checkout。
- ignored 文件不进入 change token；验证可以生成普通 ignored 构建产物而不让自身结果失效。
- Web 工作台默认以任务创建时记录的仓库 checkout 为目标；Manager API 和命令适配器可以指定同一 Git common directory 下的其他 checkout。
- `git merge-tree --write-tree` 不修改目标 checkout 或 index，但 Git 可能向共享对象数据库写入临时对象。
- 已归档和已丢弃的记录会保留在 `tasks.json`；当前版本不会自动清理历史记录。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

测试使用真实临时 Git 仓库、真实 DSH Web server 和本地 subprocess provider，覆盖任务生命周期、内容 token 失效、验证、合并预检与交付、恢复、有界输出、凭据清理、Windows 命令 shim 和 loopback 请求信任。

## 许可证与署名

[MIT](LICENSE)。派生代码边界和保留的上游署名见 [NOTICE](NOTICE)。
