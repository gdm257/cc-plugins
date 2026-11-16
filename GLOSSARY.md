# cc-plugins

DSH（DeepSeek Harness）插件市场 cc-257 的 bundles 仓库。本 glossary 固化 browser-use 线的领域语言。

## Language

**Browser-use provider**:
挂在 DSH browser-use registry 下的浏览器后端，经 seam（`ctx.browserUse`）注册，全局独占；工具按 live Session 注入。
_Avoid_: driver、backend

**Bundle**:
一个可经 plugin market 安装的 DSH 插件分发包；configuration-only bundle 只装官方 provider，code bundle 含自写插件代码。
_Avoid_: plugin（指分发包时；泛指运行时插件实体不受限）

**Dedicated Chrome**:
插件为 browser-use 自起的隔离 Chrome 实例，与用户日常 Chrome 分离；user-data-dir 独立且持久（`~/.dsh-browser-harness-profile`），登录态可跨 Session 积累。全部 Session 经引用计数共享一台，末位离场回收进程、保留 profile。
_Avoid_: attach 用户 Chrome（附着日常 Chrome 的方案，已否决）

**Browser lane**:
一个 browser-harness daemon 对应的串行浏览器通道：同 lane 操作串行并复用同一 tab。本项目每 live Session 一条独立 lane（`BU_NAME` 具名、经 `BU_CDP_URL` 接入 CDP）。
_Avoid_: 与 live Session 混为一谈（lane 是 daemon 维度）

**Attach**:
本仓语义锁定为 browser-use runtime 的 attach mode：连接既有 CDP endpoint，与 launch（自起浏览器进程）相对。与「附着用户日常 Chrome」（已否决，见 `docs/adr/0001`）无关。
_Avoid_: 用 attach 泛指「附着用户日常 Chrome」——须写全称
