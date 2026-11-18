# Spec: browser-use bundle 激活期自动补装浏览器

Status: ready-for-agent

## Problem Statement

用户从市场安装 `@gdm257/dsh-browser-use-playwright-bundle` 或 `@gdm257/dsh-browser-use-chrome-devtools-bundle` 后，预期浏览器开箱即用；实际首次使用即失败——`browser_navigate` 报 chrome-for-testing 未安装。根因是 DSH 安装器非交互运行 pnpm 10，依赖包的 postinstall（下载浏览器）被默认跳过，而市场/清单侧没有预批准构建脚本的通道，DSH 侧代码本仓不可改。

## Solution

把两个 configuration-only bundle 升级为 code bundle：插件加载（`apply`）时检测上游浏览器缓存，缺失则用依赖树内固定版本的 CLI/API 自动补装（playwright 侧 `install-browser chrome-for-testing`；puppeteer 侧安装 Chrome for Testing 进 puppeteer 缓存）。已有缓存则零开销直接放行。stagehand bundle 不改代码，仅在文档补"需要系统已装稳定版 Chrome"前置说明。

## User Stories

1. As a DSH 用户, I want 安装 playwright bundle 后无需任何手动步骤就能用浏览器工具, so that 我不用排查"为什么 browser_navigate 报浏览器未安装"。
2. As a DSH 用户, I want 已手动装好浏览器时激活不重复下载, so that 激活保持秒级。
3. As a DSH 用户, I want 自动补装在日志里可见, so that 我知道首次激活为何变慢、下载了什么。
4. As a DSH 用户, I want 补装失败时得到含精确修复命令的错误信息, so that 网络问题等场景可自助恢复。
5. As a DSH 用户, I want chrome-devtools bundle 同样开箱即用, so that 换 provider 不用重新学一套安装套路。
6. As a DSH 用户, I want 选择 stagehand bundle 时文档明确告知它从不下载浏览器, so that 我提前装好系统 Chrome 不踩坑。
7. As a bundle 维护者, I want 补装走依赖树内固定版本的上游 CLI, so that build 号永不与 provider 期望的浏览器版本错配。
8. As a bundle 维护者, I want 检测/补装逻辑有单元测试, so that 升级依赖版本时不破坏自举。

## Implementation Decisions

- 两个 bundle 各自引入一个薄插件（本包 `index.js` + `lib/*.mjs`），在 `apply(ctx)` 里做检测与补装，然后照常插入官方 provider 行；沿用 browser-harness bundle 的 code bundle 形态（`dsh.bundle.patch` 指向的 patch 声明插件行，插件包名即本 bundle 包名）。
- playwright 侧检测：对 `@playwright/mcp`（经 provider 包依赖引入，版本由 lock 决定）求其期望的 chrome-for-testing 可执行路径，存在即放行；缺失则 `spawn` 该包的 CLI 执行 `install-browser chrome-for-testing`。
- chrome-devtools 侧检测：先查系统 stable Chrome（上游 launch 顺序如此），找到即放行；否则检测 puppeteer 缓存里的 Chrome for Testing，缺失则用 puppeteer 的 `browsers.installChrome()`（或其 CLI 等价物）补装。
- 补装只发生在插件加载期，不做后台任务、不做定期检查。
- 补装失败不阻断插件注册：记日志并继续注册 provider（首次工具调用会给出上游的错误，路径仍可自助修复）。
- stagehand bundle 仅改 `docs/DETAIL.md` 补前置要求。

## Testing Decisions

- 检测与补装命令构造是纯逻辑，用 node 内置 test runner 单测（仿 browser-harness bundle 的 `test/*.test.mjs` + `test/stubs/` 先例）；对"缓存缺失/已存在"两分支断言是否发起补装进程。
- 不在单测里真的下载浏览器；真实下载只进验收（worktree 内本地安装到 desktop profile，备份并清空 ms-playwright 缓存复现原始故障，激活后确认自动补装且 `browser_navigate` 可用）。

## Out of Scope

- 修改 DSH（plugin-manager、市场索引格式、approvedBuilds 机制）。
- browser-harness bundle（Dedicated Chrome 自管，不经上游缓存）。
- 下载镜像/代理配置、Linux/macOS 分支的精细处理（补装命令本身跨平台，但验收只在 Windows 做）。
- 运行期浏览器健康检查。

## Further Notes

- 根因调查结论（pnpm 10 非交互默认跳过依赖构建脚本；`allowBuilds` 只能终端用户明示；市场索引丢弃未定义字段）已在本会话确认，源码证据在 deepseek-harness 仓 `packages/boot/plugin-manager`。
- 与 `docs/adr/0001` 无冲突：本改动不触碰 Dedicated Chrome / lane 模型，只影响 playwright / chrome-devtools / stagehand 三个官方 provider 的包装 bundle。
