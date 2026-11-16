# 0001. Dedicated Chrome 与每 Session lane 并发模型

Status: accepted

Date: 2026-11-16

## Context

browser-use 体系需要一个基于 browser-harness 的 provider，而上游 browser-harness 本机仅经 uvx 可用且无 dedicated 模式，浏览器须由插件层自起。硬约束：Chrome 的 user-data-dir 带单例锁，同一 profile 同时只能运行一个实例；需求侧则要持久 profile（有头登录一次、headless 复用登录态）且多 Session 并行。

「每 Session 一实例 + 固定共享 profile」在此约束下不可行：要么各实例独立 profile（登录态不共享、磁盘翻倍），要么共享 profile 单实例（必须共享一台 Chrome）。

## Decision

- 插件层自起一台共享 Dedicated Chrome（动态端口、持久 user-data-dir、默认 headless），provider 以 `exclusive: false` 注册，多 Session 共享。
- 每个 live Session 一条专属 Browser lane（`BU_NAME` 具名 daemon）；Session 结束回收 lane，末位离场杀 Chrome 进程、保留 profile，provider 卸载 `dispose()` 兜底回收全部。
- 工具面是裸 Python：`browser_run({ code })` / `browser_status()` 直接驱动 browser-harness 全部惯用法，不做结构化包装。
- 同 Agent 调用串行复用 runtime 的 tools/execute 守卫，不自造队列。

## 否决项

- attach 用户日常 Chrome：其 DevTools 端口不受我们控制（默认关闭）、稳定性与安全边界差。
- tools bundle 路线：不进 browser-use 体系（无注册、互斥与 per-Session 注入），且本机唯一第三方 tools bundle engines 锁旧装不上。
- 结构化工具包装（browser_navigate / browser_click 等）：裸 Python 已覆盖全部惯用法，包装留 v2。
- 每 Session 独立 Chrome：单例锁下必须各自 profile，登录态不共享、资源翻倍。
- 单例排队（一台 Chrome 串行服务全部 Session）：违背多会话并行需求。

## Consequences

- 正向：登录态全 Session 共享；并发模型简单（引用计数 + 具名 lane）；工具面零包装、能力面完整。
- 负向：跨 Session 隔离靠 lane 约定（各 lane 只动自己的 tab），共享 Chrome 意外退出后 manager 持失效句柄、至插件重载前不自动重启（已知限制）；裸 Python 无沙箱，安装者须知风险（详情页 description 明示）。
