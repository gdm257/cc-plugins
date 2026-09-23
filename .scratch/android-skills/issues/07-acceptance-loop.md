# Run strict loop acceptance on ArchiveTune

## Question

执行 map 定义的验收：在 ArchiveTune 上，agent 仅凭三个 skills 完成一个完整迭代——改代码 → 构建 → 部署到 emulator/device → 读 logcat 定位一个注入的问题 → 再改 → 构建通过——全程无人工介入。先设计验收剧本（改什么、注入什么、什么算定位成功；map 的 fog 项在此毕业），跑通后记录失败点并回灌 skill 修订。跑不通则 ticket 不算 resolved。

Type: task
Status: resolved
Blocked by: 06, 09

## Answer

验收剧本（fog 毕业项）：在 `MainActivity.onCreate` **末尾**注入 `throw IllegalStateException("WF_ACCEPTANCE_INJECTED_BUG")`；定位成功 = crash buffer 单独 dump 出 `FATAL EXCEPTION` + 标记串 + 指向注入行的栈帧；修复 = revert 注入行，重装后 pid 存活且 crash buffer 为空。

执行结果（2026-09-24，全程无人工介入，仅凭三个 skills 的约定）：

1. 基线：`assembleGmsMobileUniversalDebug` BUILD SUCCESSFUL（24m21s，冷构建 95 tasks）。
2. emulator `api36` headless boot（hub 托管进程，ready≈3min，`sys.boot_completed=1`）。
3. 基线部署：`install -r -t` Success → `am start -W` COLD ok（TotalTime 21s）→ pid 6733 存活。
4. 注入重构建：首版注入在 onCreate 开头 → Kotlin 对 unreachable 代码不做 smart-cast，级联报错 `Only safe (?.) ... calls`（817 行，远离注入点）；移到 onCreate 末尾后 BUILD SUCCESSFUL（2m57s）。
5. 复现定位：`logcat -c` → `am start` → `logcat -d -b crash -v threadtime` → `FATAL EXCEPTION: main`、`IllegalStateException: WF_ACCEPTANCE_INJECTED_BUG`、`at moe.rukamori.archivetune.MainActivity.onCreate(MainActivity.kt:2574)`——仅凭 crash buffer 精确定位到注入行；pidof 为空确认进程已死。
6. 修复：`git checkout` 还原 → 重构建 SUCCESSFUL（3m12s）→ 重装 → relaunch → pid 7089 存活、crash buffer 0 条 FATAL。`am start -W` 首次报 `Status: timeout` 但 app 实际已运行（慢速 swiftshader emulator）。

验收判定：**通过**。ArchiveTune git 状态恢复至验收前（仅原有 morideobfuscator 脏项）。

回灌 skill 修订（各 1 条，已落盘）：
- android-build 失败分类新增：unreachable 代码丢 smart-cast 的级联报错特征与注入位置建议。
- android-emulator 部署启动新增：`Status: timeout` ≠ 失败（健康判定用 pid + crash buffer）；top-most 复用 warning 与 activity-alias 别名非错误。
