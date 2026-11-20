# Stagehand browser-use provider

装载 DSH 官方 experimental provider `dsh-experimental-browser-use-stagehand-native` 的 configuration-only bundle，本包自身没有插件代码。

## 装载内容

`cordis.patch.yml` 插入两个 Loader 行：

- `browser-use` → `@deepseek-ai/dsh-browser-use`：注册 `ctx.browserUse` seam。
- `browser-use-stagehand` → `@deepseek-ai/dsh-experimental-browser-use-stagehand-native`：provider 本体，在 worker 进程中为每个 live Session 运行 Stagehand，注入六个固定工具 `stagehand_act` / `stagehand_extract` / `stagehand_navigate` / `stagehand_observe` / `stagehand_screenshot` / `stagehand_tabs`。

## 启用步骤

provider 的 Config 必填 `model`，无法带默认值出厂，因此本包默认 `disabled: true`。

1. 编辑本包 `cordis.patch.yml` 的 `browser-use-stagehand` 行：填 `config`（见下），把 `disabled` 改为 `false`。
2. 重载或重启后生效。

```yaml
- id: browser-use-stagehand
  name: '@deepseek-ai/dsh-experimental-browser-use-stagehand-native'
  disabled: false
  config:
    mode: launch
    model:
      modelName: <provider-prefixed model id>
      apiKey: <API key>
```

## 配置

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `model.modelName` | 是 | Stagehand 支持的 provider-prefixed 模型 id |
| `model.apiKey` | 是 | 该模型的 API key，仅用于浏览器内的 Stagehand 扩展，独立于会话模型 |
| `model.headers` | 否 | 附加请求头 |
| `mode` | 是 | `launch` 或 `attach` |
| `executablePath` | 否 | Chromium 路径；launch 省略时由 `@puppeteer/browsers` 管理 |
| `headless` | 否 | 是否无窗口 |
| `cdpEndpoint` | 否 | attach 模式的调试端点 |
| `operationTimeoutMs` / `shutdownGraceMs` | 否 | 超时与关闭宽限 |

## 依赖

- npm（安装时自动拉取）：`@deepseek-ai/dsh-browser-use@>=0.2.2-0 <0.2.3-0`、`@deepseek-ai/dsh-experimental-browser-use-stagehand-native@>=0.2.2-0 <0.2.3-0`（内含 Stagehand SDK 与 `@puppeteer/browsers`）。
- DSH peer（由运行时提供）：`@deepseek-ai/cordis` `~4.1.0`；`dsh-agent` / `dsh-tools` / `dsh-system-prompt` / `dsh-working-directory` `>=0.2.2-0 <0.2.3-0`。
- 依赖版本范围 `>=0.2.2-0 <0.2.3-0`：0.2.2 系列内任意版本（含 alpha、rc 与稳定版）的 DSH 均可通过安装器的 peer 校验；DSH 进入 0.2.3 后需同步更新。

## 前提与互斥

- 一个 Stagehand 支持的模型 API key（自备）。
- 预装系统稳定版 Chrome：该 provider 从不下载浏览器，只按系统标准路径寻找稳定版 Chrome（Windows 常见如 Program Files 下的 Google Chrome），找不到即启动失败。如不想手动安装，可改用会自动补装浏览器的 `dsh-browser-use-playwright-bundle` 或 `dsh-browser-use-chrome-devtools-bundle`。
- browser-use provider 全局互斥：同一时间只能启用一个 provider。换用 `dsh-browser-use-playwright-bundle` 或 `dsh-browser-use-chrome-devtools-bundle` 前，先在 Plugins 中禁用或移除本 bundle。
- experimental 包，Windows 上未经官方验证。

## 验证

配置启用后在 Plugins 中确认 `browser-use` 与 `browser-use-stagehand` 两行不是 `failed`；新开会话，调用任一 `stagehand_*` 工具。
