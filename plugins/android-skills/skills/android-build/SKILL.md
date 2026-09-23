---
name: android-build
description: Build Android projects with Gradle correctly on Windows — variant-qualified tasks (never bare assembleDebug on flavored projects), plain console, failure triage (JDK mismatch, version conflicts, file locks), and daemon management. Use when building, assembling, compiling, or diagnosing Gradle builds in Android repos.
allowed-tools: Read, Glob, Grep, Bash
---

# android-build

## 何时用 / 何时不用

用：构建 / 编译 / assemble / install 任务、`gradle tasks`、依赖解析、"构建失败"诊断、daemon 管理、增量构建与 configuration cache 问题。

不用：启动 emulator、部署安装 → `android-emulator`；读日志定位崩溃 → `android-logcat`（但"改代码 → 编译验证"的循环入口在这里）。

## 版本前提

> **版本前提**（验证于 2026-09-24）：Windows 10、scoop 工具链——Gradle wrapper 9.4.1 与 9.7.1、AGP 9.2.1/9.3.2、Kotlin 2.4.10、KSP 2.3.10、daemon JDK 17/21/25（本机 ~/.gradle/jdks + scoop zulu）。
> 结论按此基线实测；版本漂移时先跑 `gradlew.bat --version` 复核。

## 主路径（速查）

```bash
# 在项目根目录；Windows 统一 cmd 形态调 wrapper（Git Bash 也可 ./gradlew）
cmd /c gradlew.bat --version --console=plain            # 0) 自检：Gradle/JVM/Daemon JVM
cmd /c gradlew.bat help --console=plain                 # 1) 最小配置验证（触发 buildSrc 编译）
cmd /c gradlew.bat :app:tasks --all --console=plain     # 2) 抄任务全名（flavor 项目必看）
cmd /c gradlew.bat :app:compile<Variant>Kotlin --console=plain   # 3) 改码后的默认验证（不是 assemble）
# 需要 APK/安装时再：assemble<Variant> / install<Variant>
```

核心纪律：

1. **永远 `gradlew`，不用全局 `gradle`**——版本钉在 wrapper 里，全局版本漂移是头号环境性构建破坏源【实测】。
2. **有 flavor 的项目一律拼全变体名**（`installGmsMobileUniversalDebug`），从 `:app:tasks --all` 抄，不要默写。裸 `assembleDebug` 在 flavored 项目**不会失败**而是 fan-out 构建全部变体（实测 16 分钟未完成被中止）；裸 `installDebug` 则直接 not found【实测】。
3. **一律加 `--console=plain`**——pty 下 rich console 进度条原地重绘会产生行合并/重复，按行 grep 根因会错；重定向到文件时 Gradle 自动降级 plain，但显式给最稳【实测】。
4. 单次构建只允许一个 gradle 实例并发（见失败分类：文件锁）。

## 查询（只读，先看清再动手）

进入陌生 Android 仓库按需递进，别一上来就 assemble【实测】：

```bash
cmd /c gradlew.bat --version --console=plain    # 工具链自检，不配置项目，秒级
cmd /c gradlew.bat projects --console=plain     # 模块结构
cmd /c gradlew.bat :app:tasks --all --console=plain   # 任务全名（变体名是拼出来的）
# 依赖树：用 variant 限定 configuration 名，避免全量 dump
cmd /c gradlew.bat :app:dependencies --configuration gmsMobileUniversalDebugRuntimeClasspath --console=plain
# 命名规则 = 全变体名大驼峰 + RuntimeClasspath / CompileClasspath
```

- 依赖树记号：`+---`/`\---` 层级、`->` 版本被改写、`(c)` constraint、`(*)` 重复子树省略；问"为什么是这个版本"用 `dependencyInsight --dependency foo --configuration <同上>`【docs】。
- 变体名拼不准时先查 `resolvableConfigurations`（configuration 名清单）【实测】。
- `--dry-run` 打印完整任务图不执行——预测成本、确认任务名存在性【实测】。
- 迭代期编译单点验证用窄任务 `:app:compile<Variant>Kotlin`，别拖整条打包链【实测】。

## 执行 / 调用姿势

### agent 友好 flag【docs+实测】

| flag | 用途 |
|---|---|
| `--console=plain` | 常驻（见速查纪律 3） |
| `--stacktrace` | 失败时打印 JVM 栈，定位插件/task 内部错误 |
| `--dry-run` | 列任务图不执行 |
| `-q` | 成功即无需输出时（纯验证循环）；诊断阶段别用，丢 `> Task` 上下文 |
| `--offline` | 依赖已齐时显著提速；缺依赖报错快而明确 |
| `-Pkey=value` | 传项目属性（如 `-PallowUnsignedRelease=true`） |
| `-Dorg.gradle.java.home=<jdk>` | 单次调用钉 daemon JVM（见下） |

`--scan` 默认不用（发布到 scans.gradle.com 需网络+ToS）。本地替代：Gradle 9 失败时自动写 `build/reports/problems/problems-report.html`，stdout 有 file:/// 路径行【实测】。

### daemon JVM：本项目基线最重要的机制

- **daemon JVM ≠ compile toolchain**：前者跑构建逻辑（JAVA_HOME / `org.gradle.java.home` / `gradle/gradle-daemon-jvm.properties` criteria），后者是编译产物目标（`jvmToolchain()`，可自动下载）。
- 项目有 daemon criteria（`gradle-daemon-jvm.properties`）：launcher 是什么 JVM 都行，criteria 自动选【实测】。
- 项目**没有** criteria 且 JAVA_HOME 指向过新的 JDK：buildSrc 编译报 `Kotlin does not yet support N JDK target` + `Inconsistent JVM Target Compatibility`。修复 = 单次前缀 `-Dorg.gradle.java.home=<老 JDK>`（`gradlew.bat --version` 的 Daemon JVM 行可确认现状）【实测】。

### daemon 管理

```bash
cmd /c gradlew.bat --status --console=plain   # 列 daemon PID/STATUS（IDLE / STOPPED 空闲自回收均正常）
cmd /c gradlew.bat --stop --console=plain     # 卡死/换 JVM/释放内存
```

切 `-Dorg.gradle.java.home` 后提示 `1 incompatible Daemon could not be reused` 是信息性输出，非错误——各版本 JVM 各一个 daemon【实测】。

### 迭代速度

- 改一行 → 验证的成本主要在**配置阶段 + buildSrc 重编译**；daemon 常驻 + UP-TO-DATE 增量 + configuration cache 三层各砍一截（实测冷热对比：help 冷 ~3-5 分钟、热 7-30 秒）。
- `> Task :x UP-TO-DATE` = 输入未变跳过执行——重复跑同一验证命令是廉价的；"为什么没重新编译"先怀疑 inputs/outputs 声明而非 Gradle 坏了【实测】。
- configuration cache：Gradle 9.x 默认**不开**，不能假设环境自带【实测】。是否可用由项目决定（配置期起外部进程的构建不兼容）；不确定时 `help --configuration-cache` 试一次，成功则配置阶段近零（实测 15s→3s），失败则放弃，不改项目文件。

## 输出解析

失败输出骨架（`--console=plain`，结构固定）【实测】：

```
> Task :app:boom FAILED            ← 第一个 FAILED 的 task 行（执行期失败才有）

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:boom'.
> 根因消息                          ← 缩进 > 链最深层是根因

* Try: ...
BUILD FAILED in 1s
N actionable tasks: X executed
```

- 锚点从 `FAILURE: Build failed with an exception.` 起读；`* What went wrong:` 下缩进 `>` 链最深层 = 根因。
- **`0 actionable tasks` / 无 `> Task` 行 = 配置阶段就失败**（不是任务失败）。
- `* Where:` 行（文件:行号）出现在 build 脚本语法/求值错误时【docs】。
- 并行多项目 `> Task` 行交错正常；只读 FAILED 行和 What went wrong 段。

## 失败分类速查（特征串 → 根因 → 修复）

**JDK / JVM 不匹配**
- 【实测】`Kotlin does not yet support N JDK target` + `Inconsistent JVM Target Compatibility` → daemon JVM 过新 → `-Dorg.gradle.java.home=<JDK 17/21>`。
- 【实测】`org.gradle.java.home Gradle property is invalid (Java home supplied is invalid)` → 路径不存在 → 换有效 JDK。
- 【docs】Gradle 9 / AGP 9.x 均要求 Java 17+。

**版本冲突（AGP / Kotlin / Gradle）**
- 【docs】`requires Gradle version X` / `compileSdk (NN) ... this version of the AGP` → 查 AGP↔Gradle 矩阵（基线：AGP 9.2→9.4.1、9.3→9.5.0、9.4→9.6.0；compileSdk 37→AGP≥9.1.1）。排查顺序：`--version` → `gradle/libs.versions.toml` → 对矩阵。KSP 版本必须匹配 Kotlin。

**内存**
- 【docs】`OutOfMemoryError: Java heap space` / `Expiring Daemon because JVM heap space is exhausted` → 调 `org.gradle.jvmargs=-Xmx`（Kotlin daemon 另有 `kotlin.daemon.jvmargs`）；8G 内存机器别建议 8G 堆。

**Windows 文件锁**
- 【实测】`(The process cannot access the file because it is being used by another process)` → 编辑器/杀毒/adb 持 APK 等占用；或并发 gradle 残留锁 → 串行化构建 + `--stop`。
- 【docs】`Timeout waiting to lock ... in use by another Gradle instance` → 跨项目并发。

**任务名错误 / 聚合 fan-out**
- 【实测】`Cannot locate tasks that match ... not found` → `:app:tasks --all` 抄全名。
- 【实测】裸 `assembleDebug` 在 flavored 项目构建全部变体 → 变体限定名。
- 【实测】在长函数开头插入 `throw` → 其后代码 unreachable，Kotlin 对 unreachable 代码不做 smart-cast → 远离改动点报 `Only safe (?.) or non-null asserted (!!.) calls` 级联错误；按第一条 `e:` 行号判断，注入点放函数末尾或事件回调内。

**签名 / 密钥**
- 【实测】`Release signing material is required. Missing: KEYSTORE_FILE=...` → agent 迭代一律 debug 变体；确需 release 产物看项目提供的开关（如 `-PallowUnsignedRelease=true`）。
- 【docs·反例】有的项目 release 缺密钥**静默不签名**——"没报错"≠"已签名"，验签 `signingReport`。

**仓库 / 目录缺失**
- 【实测】`The configured projectDirectory '...' does not exist` → clone 后忘 `git submodule update --init --recursive`。

**configuration cache 不兼容**
- 【实测】`external process started 'git rev-parse ...' during configuration time is unsupported` → 构建逻辑配置期起进程，项目侧问题；agent 侧：别对该项目加 `--configuration-cache`。

**依赖解析**
- 【docs】`Could not resolve all files for configuration` / `Could not GET` / `Could not find` → 网络/仓库/版本；`--refresh-dependencies` 复查，`dependencies --configuration <name>` 看树。

**daemon**
- 【docs】`Daemon ... disappeared` / `Could not connect to the Gradle daemon` → daemon 崩溃 → `--stop` 后重跑。

## Windows 专区

- cmd/PowerShell 用 `gradlew.bat`，Git Bash 用 `./gradlew`；从其他 cwd 调用先 `cd` 到项目根（wrapper 按相对路径找 `gradle/wrapper`）。
- 首次跑 wrapper 自动下载发行版，慢是正常的【实测】。
- 路径过长：Android build 目录深，项目放短路径【docs】。
