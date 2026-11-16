# Spec Delta

## Purpose

为 DSH browser-use 体系提供以 browser-harness 为后端的 provider 能力：共享 Dedicated Chrome（持久 profile）上每 Session 一条专属 Browser lane 的任意 Python 浏览器自动化，lane 随会话起停、Chrome 随引用计数回收。

## ADDED Requirements

### Requirement: Provider registration and exclusivity
插件激活时 SHALL 以 `browser-harness` 之名注册进 browser-use registry；注册独占，工具 SHALL 仅注入 live Session。

#### Scenario: 激活后出现在 registry
- **WHEN** 插件启用且激活成功
- **THEN** registry 中出现 browser-harness provider 行，状态非 `failed`

#### Scenario: 停用释放
- **WHEN** provider 被禁用或卸载
- **THEN** 注册释放，浏览器与通道资源全部回收

### Requirement: Shared Dedicated Chrome with per-session lanes
首个 live Session SHALL 懒起共享 Dedicated Chrome（持久 user-data-dir、默认 headless）；每个 live Session SHALL 持有专属 Browser lane（具名 daemon）；多 Session 并行时 SHALL 互不串 tab，共享同一 Chrome 与登录态。

#### Scenario: 懒起
- **WHEN** Session 尚未调用浏览器工具
- **THEN** 无浏览器进程被启动

#### Scenario: 会话隔离
- **WHEN** 两个 live Session 并发调用浏览器工具
- **THEN** 各自在专属 Browser lane 内操作，互不串 tab

#### Scenario: 登录态保留
- **WHEN** 用户在 headed 模式手动登录某站点后结束会话
- **THEN** 后续新会话的浏览器仍保有该站点登录态

### Requirement: Lifecycle teardown
Session 结束时 SHALL 停止该会话的 daemon（lane）并对共享 Chrome 引用计数减一，计数归零时 SHALL 回收 Chrome 进程并保留 user-data-dir；provider 卸载 SHALL 兜底回收全部会话资源。

#### Scenario: 会话结束
- **WHEN** live Session 结束
- **THEN** 该 Session 的 daemon 停止；最后一个 Session 结束后无浏览器与 daemon 残留进程，profile 目录保留

#### Scenario: 卸载兜底
- **WHEN** 插件在会话进行中被禁用
- **THEN** 所有会话的浏览器资源在排队操作完成后被回收

### Requirement: browser_run tool
`browser_run` SHALL 接受任意 Python 代码并在该会话的浏览器通道内执行，如实返回 stdout / stderr；首次调用 SHALL 自动完成 daemon 预热；执行 SHALL 有 120 秒超时；返回 SHALL 含 `ok`、`exitCode`、`stdout`、`stderr`、`hint`。

#### Scenario: 打开网页回读标题
- **WHEN** agent 调用 browser_run 传入导航并读取 title 的代码
- **THEN** 返回 ok 为 true 且 stdout 含页面标题

#### Scenario: 冷启动不超时
- **WHEN** 会话首次调用 browser_run 且 daemon 与浏览器均未启动
- **THEN** 预热自动完成后正常执行，不因冷启动误报超时

#### Scenario: 超时
- **WHEN** 代码执行超过 120 秒
- **THEN** 调用失败并返回可读错误与 hint

### Requirement: browser_status tool
`browser_status` SHALL 返回运行环境健康报告（CLI 来源、模式、活跃通道、诊断结果），且 SHALL 先预热再诊断以避免假阴性。

#### Scenario: 健康自查
- **WHEN** agent 调用 browser_status
- **THEN** 返回包含 CLI 来源与 daemon 健康状态的报告

### Requirement: Intra-session serialization
同一 Session 的浏览器工具调用 SHALL 串行执行；不同 Session 之间 SHALL 并行。

#### Scenario: 并发调用排队
- **WHEN** 同一 Session 同时发起两个 browser_run
- **THEN** 两者按序执行，不产生交叉破坏

### Requirement: Configuration contract
Config SHALL 暴露 `proxy`（可选）、`chromePath`（可选）、`headless`（默认 true）三字段；激活时 SHALL 校验 browser-harness CLI 可达，缺失时 SHALL 报错并给出安装提示。

#### Scenario: 默认激活
- **WHEN** 不填任何字段激活
- **THEN** 校验通过，headless 生效

#### Scenario: 环境缺失
- **WHEN** 本机既探测不到 browser-harness 也无 uvx 兜底
- **THEN** 激活失败，错误信息含安装指引

#### Scenario: 代理生效
- **WHEN** 配置 proxy 后激活
- **THEN** Dedicated Chrome 的流量经该代理

### Requirement: Guidance and safety boundary
systemPrompt SHALL 注入 browser-harness 惯用法指引，含登录墙处置策略（停下询问用户，不自动填写凭据）；遥测 SHALL 默认禁用。

#### Scenario: 登录墙停问
- **WHEN** agent 遇到登录墙
- **THEN** 指引要求停下询问用户而非自动输密码
