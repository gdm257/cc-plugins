# Survey reference projects and local Android toolchain

## Question

探查两个参考项目与本机工具链，产出内容基线事实，供三个域的 research 引用：

- `~/codebase/ArchiveTune` 与 `~/codebase/NeriPlayer`：AGP / Gradle / Kotlin / JDK 版本（`gradle/libs.versions.toml`、`buildSrc`、`build-logic`）、模块结构、build variants / product flavors、min/target SDK、构建入口任务。
- 本机：`adb`、`emulator`、`avdmanager`、`sdkmanager` 的安装与版本（scoop shims；注意 `emulator` 不在 PATH——查明实际位置，通常在 `%LOCALAPPDATA%\Android\Sdk\emulator`），`ANDROID_HOME` 指向，已有 AVD 列表，已连接 device。
- 差异点：两项目间 flavor / 模块 / 变体差异，是否暴露 skills 覆盖缺口。

答案以事实清单形式记录（版本号、路径、任务名），不做决策。

Type: task
Status: resolved

## Answer

### ArchiveTune（`~/codebase/ArchiveTune`）

- 版本：AGP 9.3.2 / Gradle 9.7.1（wrapper 带 sha256 校验）/ Kotlin 2.4.10 / KSP 2.3.10 / compileSdk 37 / minSdk 26 / targetSdk 37 / versionCode 141 (15.0.0)。
- JDK：daemon JVM 钉死 21（`gradle/gradle-daemon-jvm.properties`，toolchainVersion=21 + foojay URL）；Kotlin `jvmToolchain(21)`；compileOptions Java 21。本机 zulu21-jdk 已装。
- 模块（14 个）：`:app`、`:core`、`:lyrics:{kugou,lrclib,simpmusic,paxsenix,betterlyrics,unison,youlyplus}`、`:lastfm`、`:canvas`、`:shazamkit`、`:spotifycore`、`:morideobfuscator`；buildSrc 只含 `GenerateIconPackTask`（图标包代码生成，挂在每个 variant 上），无 convention plugins。
- **flavor 矩阵（3 个 dimension）**：distribution `gms`(默认)/`foss` × device `mobile`/`tv` × abi `universal`/`arm64`/`armeabi`/`x86`/`x86_64`；buildTypes `debug`/`release`/`nightly`。变体名拼接如 `gmsMobileUniversalDebug`，构建入口任务形如 `gradlew :app:installGmsMobileUniversalDebug`。
- applicationId：release `moe.rukamori.archivetune`；**debug 加后缀 `.debug`、nightly 加 `.nightly`**——直接影响 `adb install` 的 APK 路径与 logcat 包名过滤。
- release/nightly 开启 minify+shrink；release 签名走环境变量（缺失时静默退化为不签名）；大量 BuildConfig 字段来自 `local.properties`/环境变量（缺省都有空值兜底，debug 构建不需要任何密钥）。
- gradle.properties：configuration-cache **关闭**、caching 关闭、`ksp.incremental=false`、daemon 4G 堆、parallel 开。
- 仓库带 `.gitmodules`（lyrics 等子模块）。

### NeriPlayer（`~/codebase/NeriPlayer`）

- 版本：AGP 9.2.1 / Gradle 9.4.1 / Kotlin 2.4.10 / KSP 2.3.10 / compileSdk 37 / minSdk 26 / targetSdk 36 / Java 17（`Version.java`，Gradle 已自动配置 adoptium 17 于 `~/.gradle/jdks`）/ NDK 27.0.12077973 / CMake：app 声明 3.22.1、convention 声明 3.28.0+。
- 模块（6 个）：`:app`、`:ksp-annotations`、`:ksp-processor`、`:accompanist-lyrics-core`、`:accompanist-lyrics-ui`（后两者 projectDir 重定向进 `np-submodule/`，带 `.gitmodules`），`includeBuild("build-logic")` convention plugins（`build-logic.android.application` 等）。
- **无 product flavors**；buildTypes 仅 `debug`/`release`；入口任务就是 `gradlew :app:assembleDebug` / `installDebug`。
- **release 被 taskGraph 守卫**：无签名材料时 assemble/bundle/package/sign Release 直接抛 GradleException，需 `-PallowUnsignedRelease=true`（PR/IDE 构建自动放行）。agent 迭代走 debug 即可绕开。
- app 含 **native 构建**（`src/main/cpp/CMakeLists.txt`，externalNativeBuild；仓库里有 `.cxx` 缓存）→ 构建时间与"改 Kotlin 不动 native"的增量语义与 ArchiveTune 不同。

### 本机工具链

- `ANDROID_HOME=C:\Users\demo\scoop\apps\android-clt\current`（junction → `D:\home\apps\scoop\apps\android-clt\15859902`，持久化在 D 盘）；`ANDROID_SDK_ROOT` 为空；`%LOCALAPPDATA%\Android\Sdk` **不存在**（ticket 原假设的默认路径不成立，须一律走 `$ANDROID_HOME`）。
- adb 36.0.0（`Version 36.0.0-13206524`）。注意存在**两份 adb**：scoop `adb` app 的 shim 优先（`scoop\apps\adb\current\platform-tools\adb.exe`），SDK 内还有一份 `android-clt\...\platform-tools\adb.exe`。
- cmdline-tools：`$ANDROID_HOME\cmdline-tools\latest\bin\`。`sdkmanager` 22.0（**已标记 deprecated**，官方替代是同目录的 `android.exe`，即新 Android CLI，本机版本 1.0.16406183，首次运行自下载组件）。`avdmanager` 可用。
- **scoop shim 从 bash 直接调 `avdmanager`/`sdkmanager` 会报 "The system cannot find the path specified."**；用完整路径 `"$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager.bat"` 调用则正常（EXIT=0）。
- SDK 内容：platforms android-31/33/34/35/36/37.0；build-tools 34.0.0/35.0.0/36.0.0；ndk 目录存在（junction 持久化）；**`system-images/` 为空；无 `emulator/` 目录；emulator.exe 全盘常见位置未找到**。
- AVD：`~/.android`（junction → `D:\home\state\.android`）下 `avd/` 为空——`avdmanager list avd` 返回 "Available Android Virtual Devices:" 空列表。
- 设备：`adb devices` 无任何连接。
- JDK：`JAVA_HOME` = zulu25-jdk（OpenJDK 25.0.4.1）；另装 zulu21-jdk；Gradle jdks 缓存里有 adoptium 17。

### 差异点与覆盖缺口信号（仅事实，不决策）

1. 变体命名：ArchiveTune 需要拼三段 flavor + buildType 的大驼峰变体名；NeriPlayer 无 flavor。skill 若只写 `assembleDebug` 在 ArchiveTune 上不成立。
2. 包名漂移：debug 后缀（`.debug`/`.nightly`）vs NeriPlayer 固定包名——logcat 按包名过滤、`adb install`、`am start` 都要按变体取 applicationId。
3. native 模块（NeriPlayer CMake/NDK）vs 纯 Kotlin/Java（ArchiveTune）——增量构建与失败模式不同。
4. **当前既无 emulator 也无实体设备连接**，验收循环（07 号 ticket）的部署目标尚不存在，需要先 provision。
5. 两项目都带 git submodules + `local.properties` 兜底，clone 后构建的前置条件一致。
