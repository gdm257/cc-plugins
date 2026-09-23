# Gradle CLI agent-first 约定研究（android-build skill · ticket 02）

研究日期：2026-09-24。版本基线以 ticket 01（`issues/01-survey-projects-toolchain.md` 的 `## Answer`）为准：

- **ArchiveTune**：AGP 9.3.2 / Gradle 9.7.1（wrapper 带 sha256）/ Kotlin 2.4.10 / daemon JVM 钉死 21 / 三段 flavor 矩阵（distribution × device × abi）/ buildTypes debug+release+nightly。
- **NeriPlayer**：AGP 9.2.1 / Gradle 9.4.1 / Kotlin 2.4.10 / compile toolchain Java 17 / NDK+CMake native / 无 flavor，buildTypes debug+release。

标注约定：`【实测】`= 本机 2026-09-24 验证过（命令原样可复跑）；`【docs】`= 来自 `android docs` CLI 或官方 Gradle/AGP 文档，未在本机复现；`【01】`= 引用 ticket 01 基线事实。

实测方式：Windows 下 `cmd /c gradlew.bat <args>`（在项目根目录）。Git Bash 下也可 `./gradlew`（shell 脚本），但 Windows agent 统一走 `gradlew.bat` 最稳。所有耗时数据来自本机（i7-8550U 4 核），量级仅供参照。

---

## 0. 本机事实基线补充（相对 ticket 01 的新发现）

| 事实 | 出处 |
|---|---|
| ArchiveTune `gradlew.bat --version`：`Daemon JVM: Compatible with Java 21, any vendor, nativeImageCapable=false (from gradle/gradle-daemon-jvm.properties)`，launcher JVM 是 zulu25 也没关系——criteria 自动选 21 的 JVM | 【实测】 |
| NeriPlayer **没有** daemon JVM criteria（gradle/ 下无 `gradle-daemon-jvm.properties`），daemon 直接用 `JAVA_HOME`=zulu25 → **buildSrc 编译失败**（详见 §5.1）。修复：加 `-Dorg.gradle.java.home=C:\Users\demo\.gradle\jdks\eclipse_adoptium-17-amd64-windows.2` 后 `help` 成功（2m58s 冷） | 【实测】 |
| 两项目 configuration cache 都是关的：ArchiveTune `org.gradle.configuration-cache=false`（显式）；NeriPlayer 未配置，Gradle 9.4.1 默认也不开（整个构建无任何 CC 输出行） | 【实测】 |
| Gradle 9.7.1 在 CC 关闭时每次构建尾行提示 `Consider enabling configuration cache to speed up this build: https://docs.gradle.org/9.7.1/userguide/configuration_cache_enabling.html` | 【实测】 |
| 两项目都设了 `ksp.incremental=false`（ArchiveTune 注明是绕 KSP Storage already registered bug；NeriPlayer 同款设置）；ArchiveTune 还显式 `org.gradle.caching=false`、daemon 4G 堆、parallel=true | 【实测·读文件】 |
| AGP↔Gradle 兼容矩阵（节选）：AGP 9.2→Gradle 9.4.1 起、AGP 9.3→9.5.0 起、AGP 9.4→9.6.0 起。两项目分别踩在矩阵线上（NeriPlayer 9.2.1+9.4.1 精确匹配；ArchiveTune 9.3.2+9.7.1 高于下限） | 【docs：`android docs fetch kb://android/build/releases/about-agp`】 |
| compileSdk 37 要求最低 AGP 9.1.1（两项目均满足）。API level↔最低 AGP 表：37.0→9.1.1，36.1→8.13.0，36→8.9.1 | 【docs：同上】 |
| 本机 ArchiveTune clone 曾缺 git submodule（`lyrics/betterlyrics` 等目录不存在）→ **configure 阶段即失败**。已执行 `git submodule update --init --recursive` 物化后恢复。验收循环（ticket 07）依赖可构建的 ArchiveTune，此为硬前提 | 【实测】 |

---

## 1. 查询：先看清构建，再动手（全部无副作用或只读）

agent 进入陌生 Android 仓库的标准序列（按需递进，别一上来就 assemble）：

```bat
:: 1. 工具链自检（不配置项目，秒级）
gradlew.bat --version
::    看 Gradle 版本 / Launcher JVM / Daemon JVM（criteria 来源）/ OS

:: 2. 首次配置 + 最小任务（触发 buildSrc/build-logic 编译，验证项目能配置）
gradlew.bat help --console=plain

:: 3. 模块结构
gradlew.bat projects --console=plain

:: 4. 任务清单（flavor 项目必看——变体任务名是拼出来的）
gradlew.bat :app:tasks --all --console=plain
::    Windows 下过滤： ... | findstr /i install   （PowerShell 用 Select-String）

:: 5. 依赖图（用 variant 限定 configuration 名，避免全量 dump）
gradlew.bat :app:dependencies --configuration debugRuntimeClasspath --console=plain          :: 无 flavor
gradlew.bat :app:dependencies --configuration gmsMobileUniversalDebugRuntimeClasspath --console=plain  :: ArchiveTune
```

`【实测】`要点：

- `:app:tasks --all` 在 NeriPlayer（无 flavor）给出 `installDebug`/`assembleDebug`/`uninstallDebug` 等裸名；在 ArchiveTune 给出 20 个 debug 变体名：`install{Gms,Foss}{Mobile,Tv}{Universal,Arm64,Armeabi,X86,X86_64}Debug` + `uninstall*` 三 buildType 全套 + `connected*AndroidTest`。`uninstallAll` 裸名存在；**裸 `installDebug` 在 flavored :app 不存在**。
- 变体限定 configuration 名 `gmsMobileUniversalDebugRuntimeClasspath` 真实可解析（12s 输出全树），命名规则 = 全变体名大驼峰 + `RuntimeClasspath`/`CompileClasspath`。
- 依赖树记号：`+---`/`\---` 层级、`->` 版本被 resolution strategy 改写、`(c)` constraint、`(*)` 重复子树省略——尾行有图例。问"为什么是这个版本"用 `dependencyInsight --dependency foo --configuration <同上>`【docs】。
- 其余好用的只读任务（NeriPlayer `:app:tasks --all` 实测列出）：`buildEnvironment`（buildscript classpath）、`javaToolchains`（本机 JVM 探测）、`outgoingVariants`/`resolvableConfigurations`（configuration 名清单——拼变体名前先查它）、`properties`、`signingReport`、`help --task <taskName>`（单个任务详情）。
- 任务名可缩写【docs】：驼峰大写前缀即可匹配（如 `aGMUD` ≈ `assembleGmsMobileUniversalDebug`），但 agent 应该拼全名，缩写会引入多匹配歧义。
- `--dry-run` 打印完整任务图（每行 `SKIPPED`）而不执行【实测：NeriPlayer `:app:assembleDebug --dry-run` 55s 列出全图，含 `configureCMakeDebug[abi]`/`buildCMakeDebug[abi]` native 链】。预测成本、确认任务名存在性，先 dry-run。

新 Android CLI（`$ANDROID_HOME\cmdline-tools\latest\bin\android.exe`，本机 1.0.16406183）有 `describe` 子命令，号称输出项目结构与 build target/APK 位置 JSON——可用于定位产物，但未在本 ticket 实测【docs-CLI】。

---

## 2. 执行：正确的调用姿势

### 2.1 永远 gradlew，不用全局 gradle

- wrapper 把 Gradle 版本钉在 `gradle/wrapper/gradle-wrapper.properties`（ArchiveTune 还带 `distributionSha256Sum` 校验）。全局 `gradle` 版本漂移是头号环境性构建破坏源。首次跑 `gradlew.bat` 会自动下载发行版【实测：ArchiveTune 9.7.1 首跑下载】。
- 升级 Gradle 的正路【docs，about-agp】：`gradle wrapper --gradle-version X.Y.Z`（需跑两次，同时升级 wrapper 自身）；wrapper 因 AGP 不兼容而失败时，直接改 `distributionUrl`。
- Windows 细节：cmd/PowerShell 用 `gradlew.bat`；Git Bash 用 `./gradlew`。从其他 cwd 调用时先 `cd` 到项目根（wrapper 脚本按相对路径找 `gradle/wrapper`）。

### 2.2 任务名：变体限定，拒绝聚合任务

`【实测】`血的教训：在 ArchiveTune（flavor 矩阵）跑 `gradlew.bat :app:assembleDebug`，**不会失败**——AGP 为每个 buildType 生成聚合任务 `assembleDebug`，它依赖全部 20 个 debug 变体，实测静默开始构建一切，16 分钟后才被人工中止；`--dry-run` 证实任务图含 20 个 `assemble{Flavor}Debug` + 聚合 `:app:assembleDebug` 本身。

规则：

- 有 flavor 的项目：一律拼全变体名（`installGmsMobileUniversalDebug`、`compileFossTvArm64NightlyKotlin`…）。变体名 = distribution+device+abi 三段大驼峰 + buildType，从 `:app:tasks --all` 或 `resolvableConfigurations` 抄，不要默写。
- 无 flavor 的项目（NeriPlayer）：裸 `assembleDebug`/`installDebug` 就是单变体入口，可直接用。
- 迭代期编译单点验证用窄任务：`:app:compileDebugKotlin`（np）/ `:app:compileGmsMobileUniversalDebugKotlin`（at），别拖整条打包链。

### 2.3 agent 友好 flag（建议常驻）

| flag | 作用 | 出处 |
|---|---|---|
| `--console=plain` | 关闭 rich console 的进度条/原地重绘。实测 pty 下 rich 输出会产生 `[###] 100% CONFIGURING` 进度条与重绘导致的**行合并/重复**（`> Run with --stacktrace option to get t> Run with --stacktrace...`），按行解析 stdout 会踩坑；重定向到文件/管道时 Gradle 自动降级 plain（实测无 ANSI 字节），但 pty 场景必须显式 `--console=plain` | 【实测】 |
| `--stacktrace` | 失败时打印 JVM 栈（默认只有异常链）。定位插件/task 内部错误用 | 【docs·Try 提示实测可见】 |
| `--dry-run` | 列任务图不执行；验证任务名、估成本 | 【实测】 |
| `-q` / `--quiet` | 只输出错误与强制输出；成功路径接近静默，适合"只要结果"的循环 | 【docs】 |
| `--offline` | 断网/离线迭代；依赖已齐时显著提速，缺依赖时报错快而明确 | 【docs】 |
| `--refresh-dependencies` | 强制刷新依赖（怀疑 snapshot/仓库变动时） | 【docs】 |
| `-Pkey=value` | 传项目属性（如 NeriPlayer `-PallowUnsignedRelease=true`） | 【实测】 |
| `-Dorg.gradle.java.home=...` | 单次调用钉 daemon JVM（NeriPlayer 本机必需，见 §5.1） | 【实测】 |
| `--scan` | 生成 Build Scan：**默认不用**——要网络发布到 scans.gradle.com 且需接受 ToS【docs】。本地替代：Gradle 9 失败时自动写 `build/reports/problems/problems-report.html`（problems report）与 `build/reports/configuration-cache/<id>/configuration-cache-report.html`，stdout 里会打印 file:/// 路径行 | 【实测·报告路径行】 |

### 2.4 daemon 管理（Windows 多 JVM 环境必会）

- `gradlew.bat --status`【实测】：列同版本 daemon 的 PID/STATUS/INFO。见过 `IDLE`、`STOPPED (after being idle for 10 minutes and not recently used and to reclaim system physical memory)`（daemon 空闲自回收）。
- `gradlew.bat --stop`【实测】：`Stopping Daemon(s)` / `3 Daemons stopped`。卡死/换 JVM/释放内存时用。
- 切换 `-Dorg.gradle.java.home` 后旧 daemon 不兼容：stdout 提示 `Starting a Gradle Daemon, 1 incompatible Daemon could not be reused, use --status for details`【实测】——不是错误，只是各版本 JVM 各一个 daemon。
- daemon 崩溃/失联特征【docs】：`Daemon ... disappeared`、`Could not connect to the Gradle daemon`；对策 `--stop` 后重跑。

---

## 3. 迭代速度：增量构建与 configuration cache 对 agent 的意义

### 3.1 实测耗时（同一命令冷/热对比）

| 场景 | 冷（含 buildSrc/build-logic 编译 + daemon 启动） | 热（daemon + UP-TO-DATE） |
|---|---|---|
| NeriPlayer `help` | 2m58s | 7s（`:app:tasks --all`）、11s（失败路径） |
| NeriPlayer `:app:assembleDebug --dry-run` | — | 55s（纯配置，native 任务图） |
| ArchiveTune `help` | 4m32s | 28s（`:app:tasks --all`）、12s（dependencies） |
| ArchiveTune `help --configuration-cache` | 15s（store） | **3s（`Configuration cache entry reused.`）** |
| 实验项目（Gradle 9.7.1 直跑）`gen` | 40s | 2s |

结论：agent 的"改一行→验证"循环成本主要在**配置阶段 + buildSrc 重编译**；daemon 常驻 + 增量 UP-TO-DATE + CC 三层各砍一截。

### 3.2 增量构建（UP-TO-DATE）语义

`【实测】`实验项目：`inputs.property("seed", ...)` + `outputs.file("out.txt")` 的任务——

- 相同输入重跑：`> Task :gen UP-TO-DATE`、`1 actionable task: 1 up-to-date`（跳过执行）；
- 输入变化（`-Pseed=b`）：重新执行。

对 agent 的含义：**重复跑同一验证命令是廉价的**（编译任务输入未变就跳过）；反之"为什么没重新编译"先怀疑 inputs/outputs 声明而非 Gradle 坏了。清理产物用 `clean<TaskName>`（rule：`clean<TaskName>` 清单任务输出【实测·tasks 输出 Rules 段】）或删 `build/` 目录。

注意两项目的增量已被人手动降级：`ksp.incremental=false`（都设了）、ArchiveTune `org.gradle.caching=false`（build cache 关）+ `org.gradle.parallel=true`（开）。NeriPlayer 有 native 链：改 Kotlin 不动 `.cxx`（CMake）产出时 native 任务全跳过；首次/改 CMake 时 `configureCMakeDebug[abi]`/`buildCMakeDebug[abi]` 是大头【01+实测任务图】。

### 3.3 configuration cache（CC）

- **本机两项目 CC 均关闭**（§0）。Gradle 9.4.1/9.7.1 默认仍不开 CC——不能假设 agent 环境自带 CC【实测】。
- ArchiveTune 与 CC 兼容：`help --configuration-cache` 首跑 `Configuration cache entry stored.`（15s），重跑 `Configuration cache entry reused.`（3s，配置阶段近零）【实测】。
- NeriPlayer 与 CC **不兼容**：`help --configuration-cache` 直接 `BUILD FAILED`：
  ```
  Configuration cache problems found in this build.
  1 problem was found storing the configuration cache.
  - Plugin 'build-logic.android.application': external process started 'git rev-parse --short HEAD'
  ```
  原因：convention plugin 在配置期起外部进程读 git commit hash（用于版本名）。`Configuration cache entry discarded with 1 problem.`【实测】
- 若要在 NeriPlayer 上硬开：`org.gradle.configuration-cache.problems=warn` 可把 CC 问题降级为警告【docs：`android docs fetch kb://android/build/optimize-your-build`】，但 skill 不该改项目文件——**结论：CC 由项目的 gradle.properties 决定，agent 只按现状感知并解释耗时**；要实验性加速时可加一次性 `--configuration-cache`（ArchiveTune 可行、NeriPlayer 会失败）。
- CC 语义注意【docs+实测】：改任何 build 脚本/gradle.properties → entry 失效重算；CC hit 时"配置期副作用"（如 np 的 banner buildUUID）不再执行。

---

## 4. 输出解析：stdout 哪段指向根因

### 4.1 失败输出的固定骨架（`--console=plain`，实测样本）

```
> Task :app:boom FAILED            ← ① 第一个 FAILED 的 task 行（任务执行期失败才有）

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:boom' (registered in build file 'build.gradle.kts').
> intentional boom for failure-output research     ← ② 根因消息（缩进 > 链，最深一层是根因）

* Try:
> Run with --stacktrace option to get the stack trace.
> Run with --info or --debug option to get more log output.
> Run with --scan to get full insights ...
> Get more help at https://help.gradle.org.

BUILD FAILED in 1s
1 actionable task: 1 executed
```

解析规则（给 agent）：

1. **锚点从 `FAILURE: Build failed with an exception.` 起读**；`* What went wrong:` 下的缩进 `>` 链最深层是根因（多级 cause 链完整保留，如 `Execution failed ... > java.io.FileNotFoundException: ... (The process cannot access...)`）。
2. `* Where:` 行（文件:行号）出现在 build 脚本语法/求值错误时【docs】。
3. `[Incubating] Problems report is available at: file:///...build/reports/problems/problems-report.html`——结构化问题的本地 HTML，比裸 stdout 全【实测·两项目均出现】。
4. 尾行统计 `N actionable tasks: X executed, Y up-to-date` 可用于判断失败发生在哪个阶段：`0 actionable tasks` / 无 `> Task` 行 = **配置阶段就失败**（如 submodule 缺失样本）；有 FAILED task 行 = 执行阶段。
5. 配置期失败同样走 `* What went wrong:` 骨架，但没有 `> Task` 行【实测：ArchiveTune submodule 样本】。
6. 多项目并行时 `> Task` 行交错属正常；只有带 `FAILED` 的行和 What went wrong 段需要读。

### 4.2 console 模式选择（实测证据）

- 默认 rich console 在**真实终端/pty**下：进度条（`[###############] 100% CONFIGURING [5s]`）、原地重绘 → 日志采集会出现合并行/重复片段（实测抓到 `...to get t> Run with --stacktrace...`），按行 grep 根因会错。
- 输出重定向到文件/管道时 Gradle 自动降级 plain（实测文件 0 个 ANSI 字节）。
- **skill 规则：agent 驱动 gradle 一律加 `--console=plain`**；对已被捕获的输出二次解析时容忍 `\r`。

### 4.3 `--quiet` 何时用

成功即无需输出时（如纯验证循环）`-q` 只留错误【docs】；但诊断阶段不要用——会丢 `> Task` 上下文。

---

## 5. 常见失败分类速查（特征串 → 根因 → 修复）

格式：**特征串**（stdout 检索锚点）→ 根因 → 修复。未标【实测】的为【docs】知识型分类。

### 5.1 JDK / JVM 不匹配

- 【实测】`Kotlin does not yet support 25 JDK target, falling back to Kotlin JVM_24 JVM target` + `Inconsistent JVM Target Compatibility ... tasks 'compileJava' (25) and 'compileKotlin' (24)`（NeriPlayer buildSrc，daemon=JAVA_HOME=zulu25 触发）→ daemon JVM 比 Kotlin 插件支持的 target 新 → **修复：`-Dorg.gradle.java.home=C:\Users\demo\.gradle\jdks\eclipse_adoptium-17-amd64-windows.2`**（本机标准前缀），或换 JAVA_HOME 到 17/21。
- 【实测】`Value 'C:\nonexistent\jdk' given for org.gradle.java.home Gradle property is invalid (Java home supplied is invalid)` → 路径不存在/不是 JDK → 改成有效 JDK 路径（本机可选：`~/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2`、`eclipse_adoptium-21-...`、scoop zulu21/zulu25）。
- 【docs】`Unsupported class file major version 69` → Gradle 版本太旧跑在新 JDK 上（本项目基线 Gradle 9.x + Java ≤25 无此问题）；`Could not determine java version` → JDK 损坏。
- 【docs】Gradle 9 运行需 Java 17+；AGP 9.x 亦要求 JDK 17+ 跑构建。
- 机制辨析（agent 必懂）：**daemon JVM**（跑构建逻辑，来自 JAVA_HOME / `org.gradle.java.home` / `gradle-daemon-jvm.properties` criteria）≠ **compile toolchain**（编译产物的目标 JVM，来自 `jvmToolchain()`/`compileOptions`，可自动下载）。ArchiveTune 两者都钉 21；NeriPlayer daemon 没钉、toolchain 17——所以 NeriPlayer 对 JAVA_HOME 敏感。

### 5.2 AGP / Kotlin / Gradle 版本冲突

- 【docs】`requires Gradle version X` / AGP 与 Gradle 矩阵不符 → 查 about-agp 矩阵（§0 表）；修复 = 升 wrapper（`gradle wrapper --gradle-version`）或降 AGP。
- 【docs】`We recommend using a newer Android Gradle plugin to use compileSdk = NN` / `compileSdk (NN) ... this version of the Android Gradle Plugin` → compileSdk 超出 AGP 支持下限（37→AGP 9.1.1+）。
- 【docs】`The dependency ... requires libraries and applications that depend on it to compile against version NN or later` → AGP/Kotlin 元版本与依赖要求冲突（常见于升 Kotlin 不升 AGP）。
- 排查顺序：`gradlew.bat --version`（Gradle/JVM）→ 读 `gradle/libs.versions.toml`（AGP/Kotlin/KSP 三件套）→ 对矩阵。KSP 版本必须匹配 Kotlin（本机两项目同为 Kotlin 2.4.10 + KSP 2.3.10【01】）。

### 5.3 内存

- 【docs】`java.lang.OutOfMemoryError: Java heap space` / `Expiring Daemon because JVM heap space is exhausted`（此后 `Daemon ... disappeared`）→ 调 `org.gradle.jvmargs=-Xmx`。
- 【docs·optimize-your-build】改 heap 建议同时加 `-XX:MaxMetaspaceSize=1g`（Gradle issue #19750）；排 OOM 用 `-XX:+HeapDumpOnOutOfMemoryError`。本机两项目都已是 4G 堆配置【实测·读文件】，8G 内存机器上不要建议 8G 堆。
- Kotlin daemon 独立配 `kotlin.daemon.jvmargs`（ArchiveTune 已设 4G【实测】）。

### 5.4 Windows 路径 / 文件锁

- 【实测】任务写文件被占用：
  ```
  > java.io.FileNotFoundException: C:\...\out.txt (The process cannot access the file because it is being used by another process)
  ```
  → 另一进程独占句柄（编辑器/杀毒/索引器/adb/emulator 持 APK）。修复：关占用方；定位占用：`openfiles`/Resource Monitor/Process Explorer。Gradle 侧无需改。
- 【实测】两个 Gradle 实例/残留锁互斥（我方独占 `buildOutputCleanup.lock` 再跑构建）：
  ```
  Gradle could not start your build.
  > Could not create service of type BuildLifecycleController ...
     > Could not create service of type OutputFilesRepository ...
        > java.io.FileNotFoundException: ...\.gradle\buildOutputCleanup\buildOutputCleanup.lock (The process cannot access the file because it is being used by another process)
  ```
  → 并发 gradle / 上一构建未退净。修复：串行化构建、`gradlew.bat --stop`。注意本 harness 只允许一个 agent 跑 gradle 就是为避免这个。
- 【docs】其他 Windows 特征：路径超长（`FileNotFound` 但文件存在/`The filename or extension is too long`，Android build 目录深，建议项目放短路径）；`Distribution URL` 下载被代理拦（wrapper `networkTimeout`）；大小写不敏感导致的重复资源定义在 Linux CI 才爆。
- 【docs】`Timeout waiting to lock ... It is currently in use by another Gradle instance`：跨项目并发时的标准锁等待信息（本机实测到的是其 FileNotFoundException 变体）。

### 5.5 任务名错误 / 聚合任务陷阱

- 【实测】`Cannot locate tasks that match ':app:zzzNonsense' as task 'zzzNonsense' not found in project ':app'.` + `* Try: > Run gradlew tasks to get a list of available tasks.` → 拼错/变体名错。修复：`:app:tasks --all` 抄全名。
- 【实测】**聚合任务 fan-out**：flavored 项目裸 `assembleDebug` 合法但构建全部 20 变体（16min+ 被中止）。修复：变体限定名（§2.2）。`installDebug` 在 flavored :app 直接 not found（只有 `install<Variant>`）。

### 5.6 签名 / 密钥缺失

- 【实测】NeriPlayer release 守卫（配置期 taskGraph 检查，直接 GradleException）：
  ```
  Release signing material is required. Missing: KEYSTORE_FILE=neri.jks, KEYSTORE_PASSWORD, KEY_PASSWORD. Pass -PKEYSTORE_FILE, -PKEYSTORE_PASSWORD, -PKEY_ALIAS and -PKEY_PASSWORD or use -PallowUnsignedRelease=true for PR validation builds.
  ```
  → agent 迭代一律 debug 变体；确需 release 产物加 `-PallowUnsignedRelease=true`。
- 【01】ArchiveTune 相反：release 缺密钥**静默退化为不签名**，不报错——"没报错"不等于"已签名"，验签用 `signingReport`。

### 5.7 仓库/目录缺失（submodule、include 不存在）

- 【实测】ArchiveTune 缺 submodule 时配置期失败：
  ```
  Configuring project ':lyrics:betterlyrics' without an existing directory is not allowed. The configured projectDirectory '...\lyrics\betterlyrics' does not exist, can't be written to or is not a directory.
  Possible solution: Make sure the project directory exists and is writable.
  ```
  → clone 后忘 `git submodule update --init --recursive`。这是**验收循环（ticket 07）的硬前提**：本机 ArchiveTune 已修复（2026-09-24 物化 4 个 submodule：IconPack/core/lyrics/morideobfuscator）。

### 5.8 configuration cache 不兼容

- 【实测】np 样本见 §3.3：`external process started 'git rev-parse --short HEAD' during configuration time is unsupported` → build 逻辑配置期起进程。修复属于项目侧（provider 化/valueSource）；agent 侧：别对 np 加 `--configuration-cache`。

### 5.9 依赖解析失败

- 【docs】`Could not resolve all files for configuration ...` / `Could not GET ...` / `Could not find ...` → 网络代理、仓库 down、版本不存在。`--refresh-dependencies` 复查；`dependencies --configuration <name>` 看已解析树。jitpack 超时类（ArchiveTune gradle.properties 已把 http 超时调到 180s【实测·读文件】）。

### 5.10 daemon 消失 / 不兼容

- 【实测】`Starting a Gradle Daemon, 1 incompatible Daemon could not be reused, use --status for details`（信息性，非失败）；`--status` 可见 daemon 自回收（`STOPPED (after being idle...)`）。
- 【docs】`Daemon ... disappeared / exit value != 0` → daemon 崩溃（常伴随 OOM 或 JDK 崩溃日志路径），`--stop` 后重跑。

---

## 6. 版本前提（SKILL.md 直接引用）

1. **调用形态**：项目根目录 `cmd /c gradlew.bat <task> --console=plain`；改前置 `cd`。Git Bash 可 `./gradlew`。
2. **JDK 前缀（本机 NeriPlayer 必需）**：`-Dorg.gradle.java.home=C:\Users\demo\.gradle\jdks\eclipse_adoptium-17-amd64-windows.2`。ArchiveTune 不需要（criteria 自理，会选 21）。不确定时先 `--version` 看 Daemon JVM 行。
3. **变体命名**：ArchiveTune 任务/config 全部三段 flavor 大驼峰限定（§1/§2.2）；NeriPlayer 裸 debug/release。
4. **兼容矩阵**（AGP→最低 Gradle）：9.2→9.4.1，9.3→9.5.0，9.4→9.6.0；compileSdk 37→AGP≥9.1.1【docs】。
5. **CC 现状**：两项目均关；ArchiveTune 兼容可 `--configuration-cache` 实验加速（15s→3s），NeriPlayer 不兼容（配置期 git rev-parse）。
6. **默认验证命令**（agent 改完代码跑这个，不是 assemble）：`:app:compile<Variant>Kotlin` → 需要 APK 时再 `:app:assemble<Variant>` / `install<Variant>`。
7. **构建报告**：`build/reports/problems/problems-report.html`（每次失败自动生成，stdout 有 file:/// 行）。

---

## 附：本研究的实测命令清单（复跑用）

均在项目根目录；`AT=C:\Users\demo\codebase\ArchiveTune`，`NP=C:\Users\demo\codebase\NeriPlayer`，`JDK17=C:\Users\demo\.gradle\jdks\eclipse_adoptium-17-amd64-windows.2`。

```bat
cd /d AT && cmd /c gradlew.bat --version --console=plain
cd /d AT && cmd /c gradlew.bat help --console=plain
cd /d AT && cmd /c gradlew.bat :app:tasks --all --console=plain
cd /d AT && cmd /c gradlew.bat :app:dependencies --configuration gmsMobileUniversalDebugRuntimeClasspath --console=plain
cd /d AT && cmd /c gradlew.bat :app:assembleDebug --dry-run --console=plain
cd /d AT && cmd /c gradlew.bat help --configuration-cache --console=plain   (x2: store/reuse)
cd /d AT && cmd /c gradlew.bat --status --console=plain && cmd /c gradlew.bat --stop --console=plain

cd /d NP && cmd /c gradlew.bat --version --console=plain
cd /d NP && cmd /c gradlew.bat help --console=plain -Dorg.gradle.java.home=%JDK17%
cd /d NP && cmd /c gradlew.bat :app:tasks --all --console=plain -Dorg.gradle.java.home=%JDK17%
cd /d NP && cmd /c gradlew.bat :app:dependencies --configuration debugRuntimeClasspath --console=plain -Dorg.gradle.java.home=%JDK17%
cd /d NP && cmd /c gradlew.bat :app:assembleDebug --dry-run --console=plain -Dorg.gradle.java.home=%JDK17%
cd /d NP && cmd /c gradlew.bat :app:assembleRelease --console=plain -Dorg.gradle.java.home=%JDK17%      (预期失败:签名守卫)
cd /d NP && cmd /c gradlew.bat :app:zzzNonsense --console=plain -Dorg.gradle.java.home=%JDK17%          (预期失败:任务不存在)
cd /d NP && cmd /c gradlew.bat help --configuration-cache --console=plain -Dorg.gradle.java.home=%JDK17% (预期失败:CC 不兼容)
```

实验项目（文件锁/UP-TO-DATE/java.home 无效/rich console 重定向，`C:\Users\demo\AppData\Local\Temp\gradlelab`，Gradle 9.7.1 发行版直跑 + adoptium 21）：`gen`、`gen -Pseed=b`、`gen -Pseed=c`（锁定 out.txt 时）、`boom`、`boom > ansi_raw.txt 2>&1`、`help -Dorg.gradle.java.home=C:\nonexistent\jdk`。PowerShell 独占锁命令：`[System.IO.File]::Open('<file>','Open','ReadWrite','None')` + `Start-Sleep`。
