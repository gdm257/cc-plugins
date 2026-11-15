# Playwright browser-use provider

装载 DSH 官方 experimental provider `dsh-experimental-browser-use-playwright-mcp` 的 configuration-only bundle，本包自身没有插件代码。

## 装载内容

`cordis.patch.yml` 插入两个 Loader 行：

- `browser-use` → `@deepseek-ai/dsh-browser-use`：注册 `ctx.browserUse` seam。
- `browser-use-playwright` → `@deepseek-ai/dsh-experimental-browser-use-playwright-mcp`：provider 本体，为每个 live Session 经 `@playwright/mcp` 启动专属 Chromium，把上游 Playwright MCP 工具注入该会话；DSH 不持久化浏览器状态。

## 配置

Config 类型为 `BrowserMcpConfig`，launch / attach 二选一。

launch 模式（本包默认）：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `mode` | 是 | `launch` |
| `headless` | 否 | 是否无窗口，默认 `true` |
| `executablePath` | 否 | Chromium 可执行文件路径；省略时用上游 server 的安装发现 |
| `toolCallTimeoutMs` | 否 | 单次工具调用超时，省略用 MCP client 默认值 |

attach 模式：`mode: attach` + `endpoint`（HTTP(S)/WS(S) 调试端点），独占附着一个外部已开的浏览器。

改配置：编辑本包 `cordis.patch.yml` 中 `browser-use-playwright` 行的 `config`，重载或重启后生效。

## 依赖

- npm（安装时自动拉取）：`@deepseek-ai/dsh-browser-use@0.2.2-rc.3`、`@deepseek-ai/dsh-experimental-browser-use-playwright-mcp@0.2.2-rc.3`（内含 `@playwright/mcp`）。
- DSH peer（由运行时提供）：`@deepseek-ai/cordis` `~4.1.0`；`dsh-agent` / `dsh-tools` / `dsh-system-prompt` / `dsh-working-directory` `0.2.2-rc.3`。
- 依赖版本锁 `0.2.2-rc.3`：与本机 DSH 版本一致才能通过安装器的 peer 校验；升级 DSH 时需同步更新。

## 前提与互斥

- 需要可被上游发现的 Chromium/Chrome，或在 config 指定 `executablePath`。
- browser-use provider 全局互斥：同一时间只能启用一个 provider。换用 `dsh-browser-use-chrome-devtools-bundle` 或 `dsh-browser-use-stagehand-bundle` 前，先在 Plugins 中禁用或移除本 bundle。
- experimental 包，Windows 上未经官方验证。

## 验证

安装后在 Plugins 中确认 `browser-use` 与 `browser-use-playwright` 两行不是 `failed`；新开会话，调用会话内新增的 Playwright 浏览器工具（如 `browser_navigate`）。
