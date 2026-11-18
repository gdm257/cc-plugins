# 01: playwright bundle 激活期自动补装浏览器

**What to build:** 用户安装/启用 `@gdm257/dsh-browser-use-playwright-bundle` 后，插件加载时检测上游期望的 chrome-for-testing 是否在 ms-playwright 缓存，缺失则经依赖树内固定版本的 `@playwright/mcp` CLI 自动补装并记日志；已有缓存时零开销放行。补装失败不阻断 provider 注册，错误信息含精确修复命令。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] bundle 升级为 code bundle（插件行 + 检测/补装逻辑），provider 注册行为不变
- [x] 缓存缺失分支发起补装、已存在分支不发起，均有单元测试（仿 browser-harness bundle 的 stub 先例，不真下载）
- [x] 补装与跳过均在日志可见；失败路径错误信息含手动修复命令
- [x] DETAIL.md 更新自举行为说明
