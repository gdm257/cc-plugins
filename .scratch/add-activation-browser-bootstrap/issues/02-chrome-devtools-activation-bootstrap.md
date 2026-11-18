# 02: chrome-devtools bundle 激活期自动补装浏览器

**What to build:** 用户安装/启用 `@gdm257/dsh-browser-use-chrome-devtools-bundle` 后，插件加载时先查系统 stable Chrome，找到即放行；否则检测 puppeteer 缓存的 Chrome for Testing，缺失则经依赖树内 puppeteer 自动补装并记日志。失败不阻断注册，与 01 同构。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] bundle 升级为 code bundle，检测顺序与上游 launch 顺序一致（系统 Chrome → puppeteer 缓存）
- [x] 缺失/已存在两分支有单元测试（不真下载）
- [x] DETAIL.md 更新自举行为说明
