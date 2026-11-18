# Chrome DevTools browser-use provider

装载 DSH 官方 experimental provider `dsh-experimental-browser-use-chrome-devtools-mcp` 的 wrapper bundle；自 v1.1.0 起为 code bundle，附带一个激活期自举插件。

## 装载内容

`cordis.patch.yml` 插入三个 Loader 行：

- `browser-use` → `@deepseek-ai/dsh-browser-use`：注册 `ctx.browserUse` seam。
- `browser-use-chrome-devtools` → `@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp`：provider 本体，为每个 live Session 经 `chrome-devtools-mcp` 启动专属 Chromium，把上游 DevTools MCP 工具注入该会话；DSH 不持久化浏览器状态。
- `browser-use-chrome-devtools-bootstrap` → 本包：激活期 Chrome 自举（见下）。

## 激活期自举

插件加载（`apply`）时按上游 launch 顺序检测浏览器，全部本地完成、不产生网络请求：

1. 系统 stable Chrome：Windows 下按上游捆绑 puppeteer 的发现逻辑（`PROGRAMFILES` / `ProgramW6432` / `ProgramFiles(x86)` / `LOCALAPPDATA` 环境变量前缀，加上 `C:\Program Files` 等固定盘符路径，后缀 `Google\Chrome\Application\chrome.exe`）；macOS / Linux 为标准安装位置。找到即放行，零开销。
2. puppeteer 缓存的 Chrome for Testing：扫描 `~/.cache/puppeteer`（可用 `PUPPETEER_CACHE_DIR` 覆盖）下最新已装版本。找到即放行。
3. 两者皆缺：spawn `npx -y puppeteer@25.10.0 browsers install chrome@stable` 补装 Chrome for Testing 进同一缓存，过程在 DSH 日志可见（首次激活可能耗时数分钟）。版本锁定 25.10.0，与 provider 锁定的 `chrome-devtools-mcp@1.9.0` 内联打包的 puppeteer 一致，避免 npx 每次拉最新 puppeteer 带来行为漂移和额外下载。

`apply` 触发自举后即返回（fire-and-forget），不等待补装完成，激活不会被最长 10 分钟的下载阻塞。补装失败或超时（默认 10 分钟）只记含手动修复命令 `npx puppeteer browsers install chrome@stable` 的错误日志，不抛出、不阻断插件注册；首次工具调用会给出上游错误，修复后重载即可。

已知上游限制：`chrome-devtools-mcp@1.9.0`（provider `0.2.2-rc.3` 锁定）在未配置 `executablePath` 时只走系统 stable Chrome 发现，不回退 puppeteer 缓存。因此自举补装的 Chrome for Testing 需在 `browser-use-chrome-devtools` 行 config 里设置 `executablePath` 指向日志中给出的缓存路径才会被 provider 使用；已装系统 Chrome 的机器不受影响。

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

改配置：编辑本包 `cordis.patch.yml` 中 `browser-use-chrome-devtools` 行的 `config`，重载或重启后生效。

## 依赖

- npm（安装时自动拉取）：`@deepseek-ai/dsh-browser-use@0.2.2-rc.3`、`@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp@0.2.2-rc.3`（内含 `chrome-devtools-mcp`）。
- DSH peer（由运行时提供）：`@deepseek-ai/cordis` `~4.1.0`；`dsh-agent` / `dsh-tools` / `dsh-system-prompt` / `dsh-working-directory` `0.2.2-rc.3`。
- 依赖版本锁 `0.2.2-rc.3`：与本机 DSH 版本一致才能通过安装器的 peer 校验；升级 DSH 时需同步更新。

## 前提与互斥

- 需要可被上游发现的 Chrome/Chromium，或在 config 指定 `executablePath`。
- browser-use provider 全局互斥：同一时间只能启用一个 provider。换用 `dsh-browser-use-playwright-bundle` 或 `dsh-browser-use-stagehand-bundle` 前，先在 Plugins 中禁用或移除本 bundle。
- experimental 包，Windows 上未经官方验证。

## 验证

安装后在 Plugins 中确认 `browser-use` 与 `browser-use-chrome-devtools` 两行不是 `failed`；新开会话，调用会话内新增的 DevTools 浏览器工具。
