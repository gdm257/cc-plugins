# 04: desktop profile 端到端验收

**What to build:** 在 worktree 完成实现后，本地安装升级后的 playwright bundle 到 desktop profile：备份并清空 ms-playwright 缓存复现原始故障，激活后确认自动补装成功且会话内 `browser_navigate` 可用；chrome-devtools 侧至少验证检测分支逻辑与文档。

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [x] 清缓存复现原始故障（chrome-for-testing 未安装报错）
- [x] 安装升级 bundle 后激活期自动补装成功，日志可见
- [x] 新会话 `browser_navigate` 实测通过
- [x] 验收后恢复被清掉的缓存（或确认自动补装的缓存等价可用）
