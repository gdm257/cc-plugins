# Spec Delta

## Purpose

让装载官方 browser-use provider 的 wrapper bundle 在激活期自举上游浏览器：检测缓存、缺失自动补装，使浏览器工具安装后开箱即用。

## ADDED Requirements

### Requirement: 激活期检测浏览器缓存
bundle 的插件加载时 SHALL 检测其上游 provider 期望的浏览器是否已可用（playwright 侧为 ms-playwright 缓存中的 chrome-for-testing；chrome-devtools 侧先系统 stable Chrome、再 puppeteer 缓存），检测本身 MUST NOT 产生下载或网络请求。

#### Scenario: 缓存已存在
- **WHEN** 期望的浏览器可执行文件已在上游缓存或系统路径中
- **THEN** 插件直接放行，不发起任何补装，provider 注册不受影响

#### Scenario: 缓存缺失
- **WHEN** 期望的浏览器不存在
- **THEN** 插件进入补装流程（见下一条 Requirement）

### Requirement: 缺失时自动补装
缓存缺失时 bundle SHALL 使用依赖树内同版本的上游安装机制自动补装（playwright 侧固定版 CLI 的 `install-browser chrome-for-testing`；puppeteer 侧安装 Chrome for Testing 进其缓存），补装过程 MUST 在日志中可见。

#### Scenario: 补装成功
- **WHEN** 补装进程正常退出
- **THEN** 上游缓存中出现期望的浏览器，provider 照常注册，后续浏览器工具可用

#### Scenario: 补装失败
- **WHEN** 补装进程失败或超时
- **THEN** 插件记录含精确手动修复命令的错误信息，且不阻断 provider 注册

### Requirement: 不自举的 provider 明示前置要求
stagehand wrapper（provider 只找系统稳定版 Chrome、从不下载）SHALL 在其文档中明示该前置要求，且 MUST NOT 添加任何下载逻辑。

#### Scenario: stagehand 文档前置说明
- **WHEN** 用户浏览 stagehand bundle 详情文档
- **THEN** 能看到"需预先安装系统稳定版 Chrome，本 bundle 不下载浏览器"的说明
