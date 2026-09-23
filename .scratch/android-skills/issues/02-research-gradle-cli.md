# Research agent-first Gradle CLI conventions

## Question

为 `android-build` skill 研究构建域的 agent-first 约定：agent 在 Android 项目里驱动 Gradle 的正确姿势——`gradlew`（而非全局 gradle）、常用诊断任务（`dependencies`、`--scan` 除外看情况）、增量构建与 configuration cache 对 agent 迭代的意义、构建输出解析（哪段 stdout 指向根因）、常见失败分类（JDK 不匹配、AGP/Kotlin 版本冲突、内存、Windows 路径/文件锁如 `file locked by another process`）、`--console=plain` 等对 agent 友好的 flag。以 01 号 ticket 的版本基线为准，研究源优先 `android docs` CLI，辅以官方 Gradle/AGP 文档与两项目实测。

Type: research
Status: resolved
Blocked by: 01

## Answer

- 研究文档：[research/gradle-cli.md](../research/gradle-cli.md)（命令均标注【实测】/【docs】，附复跑清单）。
- 调用形态：项目根 `cmd /c gradlew.bat <task> --console=plain`（Windows）；rich console 在 pty 下会产出进度条与重绘合并行，按行解析 stdout 前必须 plain。永远 gradlew 不用全局 gradle。
- 任务名是第一坑：ArchiveTune（flavor 矩阵）裸 `:app:assembleDebug` 合法但是聚合任务——实测静默 fan-out 构建全部 20 个 debug 变体（16min 才人工中止）；裸 `installDebug` 则不存在。必须变体限定（`installGmsMobileUniversalDebug`）。NeriPlayer 裸 `installDebug`/`assembleDebug` 即可，但 release 被签名守卫拦（`-PallowUnsignedRelease=true` 放行，实测）。
- JDK：NeriPlayer daemon 未钉 JVM，本机 JAVA_HOME=zulu25 会炸 buildSrc（`Inconsistent JVM Target Compatibility (25 vs 24)`，实测）；标准前缀 `-Dorg.gradle.java.home=<adoptium17>` 修复。ArchiveTune 有 daemon criteria 21，自理。daemon JVM ≠ compile toolchain。
- 增量/CC：daemon+UP-TO-DATE 实测把迭代从分钟级降到秒级（np help 2m58s→7s）；两项目 CC 均关（Gradle 9 默认仍不开）。ArchiveTune 兼容 CC（store 15s→reused 3s），NeriPlayer 不兼容（convention plugin 配置期跑 `git rev-parse`，`--configuration-cache` 直接 BUILD FAILED，实测）。
- 失败解析锚点：`FAILURE: Build failed` → `* What went wrong:` 缩进 `>` 链最深层为根因；`> Task :x FAILED` 行定位任务；无 Task 行=配置期失败；本地 problems-report.html 路径行每次失败都有。全分类（JDK/版本矩阵/内存/Windows 文件锁两种实测变体/聚合 fan-out/签名/submodule/CC/daemon）见文档 §5。
- 版本矩阵【docs】：AGP 9.2→Gradle 9.4.1+、9.3→9.5.0+、9.4→9.6.0+；compileSdk 37→AGP≥9.1.1。两项目均踩线合规。
- **给 07 的硬前提**：本机 ArchiveTune clone 曾缺 git submodule，任何 configure 即失败（实测）；已 `git submodule update --init --recursive` 修复（4 个子模块物化，未动 tracked 内容）。
