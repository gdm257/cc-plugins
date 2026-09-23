# Research 04 — adb logcat 的 agent-first 用法（android-logcat skill 素材）

- 基线：ticket 01（`.scratch/android-skills/issues/01-survey-projects-toolchain.md`）——本机 adb 36.0.0（scoop shim `C:\Users\demo\scoop\shims\adb.EXE` → `scoop\apps\adb\current\platform-tools\adb.exe` 优先于 SDK 内那份），无 emulator、无 AVD、无连接设备。
- 来源标注：**[docs]** = `android docs` CLI 抓取的官方 developer docs（2026-09-24，kb://android/tools/logcat、kb://android/studio/debug/bug-report）；**[AOSP]** = AOSP `system/logging/logcat.cpp`（main 分支）help 文本与实现；**[实测]** = 本机 adb 36.0.0 无设备实测；**[约定]** = 综合 agent 实践的建议，非官方。

## 1. 前置 gate：logcat 无设备时不是报错，是永久挂起

**[实测]** 无设备时各命令行为（子进程直跑，默认超时 15–90s）：

| 命令 | 结果 |
|---|---|
| `adb devices` | RC=0，输出 `List of devices attached` + 空列表 |
| `adb get-state` | RC=1，stderr `error: no devices/emulators found`（**立即失败**） |
| `adb shell true` | RC=1，stderr `adb.exe: no devices/emulators found`（立即失败） |
| `adb shell pidof x` | RC=1，同上（立即失败） |
| `adb logcat -d` | **挂起**，stderr 周期输出 `- waiting for device -` |
| `adb logcat --help` | **挂起**，同上（90s 仍未退出） |
| `adb logcat -c` / `adb logcat -d -s Test` / `adb logcat -d *:E` / `adb logcat --pid=1234 -d` | 全部**挂起** `- waiting for device -` |
| `adb -s emulator-5554 logcat -d` | 仍**挂起**（`-s` 显式串号对 logcat 不生效 fail-fast） |
| `adb -s emulator-5554 shell true` | RC=1，`adb.exe: device 'emulator-5554' not found`（立即失败） |

原因：`--help`、`-d`、`-c` 都是**设备端 logcat 二进制**的参数，由 adb 透传；adb 选不到 transport 就进入 wait 循环。**[docs]** tools/logcat 页也明说 "To see help for logcat specific to the device you're using, execute: `adb logcat --help`"——即 help 依赖设备。

SKILL 约定（可直接抄）：

```
adb get-state        # RC=0 输出 device 状态才继续；RC=1 = 无设备，直接终止而不是等
```

任何 `adb logcat` 调用前必须先过这个 gate；且所有 logcat 调用应带超时兜底（无设备时它不会自己报错退出）。

另一条实测顺序陷阱：`adb -e FATAL -d`（logcat 参数放在 `logcat` 子命令**之前**）被 adb 当成自己的 flag 解析，报 `adb.exe: unknown command FATAL`、RC=1。logcat 的参数必须全部放在 `logcat` 之后。**[实测]**

## 2. 过滤语法（FILTERSPEC 与 regex）

**[docs]** + **[AOSP]** 一致确认：

- 过滤表达式格式：`tag:priority ...`（空格分隔，可多个）；priority 为该 tag 的**最低**级别：`V < D < I < W < E < F < S`（S=silent 全部抑制）。
- allowlist 模式：`adb logcat ActivityManager:I MyApp:D *:S`——末尾 `*:S` 把其余全部静音，官方推荐的收窄写法。
- `adb logcat "*:W"` = 所有 tag 只显示 W 及以上。`*` 在 bash/PowerShell 会被展开，**必须加引号**（docs 明确提醒）。
- 缩写规则 **[AOSP]**：`'*'` 单独出现等价 `*:D`；`<tag>` 单独出现等价 `<tag>:V`；`-s` 等价于先设 `*:S`（所以 `adb logcat -s MyTag` = 只看 MyTag）。命令行无任何 filterspec 时默认 `*:V`。
- 命令行无 filterspec 时读环境变量 `ANDROID_LOG_TAGS`（仅本地 logcat 生效，不透传到 `adb shell logcat` 场景）。**[docs]**
- regex 过滤（设备端 logcat）**[AOSP]**：`-e <EXPR>` / `--regex=<EXPR>`（ECMAScript regex，匹配**消息体**）；`-m <N>` / `--max-count=<N>` 打印 N 条匹配后退出；`--print` 与 `--regex`+`--max-count` 连用可把不匹配的上下文也打出来。**`-m` 与 `-t` 互斥**（同用报错）。
- `--pid=<PID>` **只接受一个** pid 参数，给两次直接报错（AOSP: "Only one --pid argument can be provided"）；要按多个进程过滤用 `--uid=<uid[,uid...]>`（纯数字，逗号分隔，不做名字解析；普通 app uid 的日志 adb shell 用户可见）。**[AOSP]**
- 输出格式默认 `threadtime`（date time priority tag PID TID），最适合 agent 解析；`-v uid` 可加 uid 列。**[docs]**

## 3. package → pid → 过滤的完整管道（可直接照抄）

logcat **没有按包名过滤**的 filterspec（`package:` 是 Android Studio Logcat 窗口的语法，不适用于 CLI）；CLI 要先解析 pid/uid。**[docs]**（tools/logcat 页只给 tag:priority；Studio 页 kb://android/studio/debug/logcat 的 package 语法属 IDE）

包名取 applicationId，**不是**模块名/variant 名。按 ticket 01：

- ArchiveTune debug 构建是 `moe.rukamori.archivetune.debug`，nightly 是 `.nightly`，release 是 `moe.rukamori.archivetune`——**logcat 过滤前先按 variant 拼对后缀**。
- NeriPlayer 无 flavor，debug/release 同包名。

### 管道 A：单进程（首选）

```bash
adb get-state                                        # gate：RC=0 才继续
PKG=moe.rukamori.archivetune.debug                  # 按 variant 拼 applicationId（.debug/.nightly 后缀）
PID=$(adb shell pidof -s "$PKG" | tr -d '\r')       # -s 只取一个；adb shell 输出带 CRLF，必须去 \r
[ -n "$PID" ] || { echo "app not running: $PKG"; exit 1; }
adb logcat --pid="$PID" -d -v threadtime            # dump 一次即退
```

`tr -d '\r'`：Windows 上 `adb shell` 输出行尾是 CRLF，不去掉会把 CR 带进 `--pid=` 报 "pid out of range"。**[实测：adb shell 输出通道 CRLF；CR 混入即非法——据 adb shell 行为推定，标注约定+实测混合]** `pidof` 无匹配时输出空、设备端 RC=1。**[约定/通用 toybox 行为，未实测（本机无设备）]**

### 管道 B：uid 过滤（多进程进程组、或 pid 拿不到时）

```bash
UID=$(adb shell dumpsys package "$PKG" | grep -o 'userId=[0-9]*' | head -1 | grep -o '[0-9]*' | tr -d '\r')
adb logcat --uid="$UID" -d -v threadtime            # 覆盖该 app 的全部进程（:remote 服务等）
```

`--uid` 支持逗号列表且数值 only；从 adb shell 读其他 app uid 的日志是允许的。**[AOSP]**

### 迭代循环内注意

- **每次重装/重启进程 pid 都会变**：循环里每轮重新解析 pid，不要缓存。
- pid 解析失败的三种含义：包名拼错（忘 `.debug`）、app 崩溃已退出（去看 crash buffer，见 §6）、未安装。

## 4. dump（-d）vs 流式；-t / -T 取最近 N 条

- `-d`：dump 当前缓冲并退出（不阻塞）。**[AOSP]** agent 的默认形态——输出有界、可整读、可 grep。
- `-t <N>`：打印最近 N 行**并退出**（隐含 -d）；`-t '<time>'` 打印某时刻之后的并退出。**[AOSP]**
- `-T <N>`：打印最近 N 行后**继续流式跟随**（不隐含 -d）；`-T '<time>'` 同理。**[AOSP]** 时间格式：`MM-DD hh:mm:ss.mmm…`、`YYYY-MM-DD hh:mm:ss.mmm…`、`sssss.mmm…`（自 boot 的秒数，即 threadtime 行首的时间字段可原样回填）。**[AOSP]**
- 流式的 agent 用法（需要观察"复现期间"日志时）：后台采集到文件，复现后停止再离线解析：

```bash
adb logcat --pid="$PID" -v threadtime > run.log 2>&1 &   # 记下这个后台 pid
# ... 触发复现 ...
kill %1                                                   # 停止
grep -nE "FATAL|Exception" run.log
```

配合 `-T 1`（从最近 1 行开始）可避免把历史缓冲全部灌进文件。**[约定]**

## 5. ring buffer 语义与读取范围

- Android 日志是 logd 维护的**固定集合循环缓冲**，每个 entry 有 priority/tag/message；关键缓冲：`main`（应用日志）、`system`（OS）、`crash`（崩溃日志）；另有 `radio`/`events`，`kernel`（userdebug/eng 构建）、`security`（device owner 安装）。**[docs]**
- 默认读取集合：docs 页写 `main,system,crash`；AOSP main 分支 help 写 default `main,system,crash,kernel`（kernel 仅在存在该缓冲的构建上）——**设备 OS 版本决定**，跨设备脚本要显式 `-b`。**[docs]+[AOSP]**
- `-b <buffer>` 可多次给或逗号分隔（`-b main,crash`）；`-b all` 全部；`-b default` = main+system+crash。**[docs]**
- `-g` 查各 ring buffer 大小（典型每缓冲 256KB 量级，以设备为准）。**[AOSP]**
- 推论（**[约定]**）：ring 会滚动覆盖，复现后要**尽快 dump**；dump 结果只覆盖"最近一段"，历史被覆盖的部分 `adb logcat` 拿不回来——需要更长历史才考虑 bugreport（§6）。

## 6. crash 定位

- Java/Kotlin 崩溃：main buffer 里 tag `AndroidRuntime` 的 `E` 级段，首行 `FATAL EXCEPTION: <thread>`，随后 `Process: <pkg>, PID: <n>`、栈帧、可选 `Caused by: ...` 链。崩溃同时进 `crash` buffer。**[docs]（crash buffer 存 crash logs）+ [约定]（段格式为平台长期稳定行为，本次无设备未实测）**
- 推荐定位序列（从窄到宽，可直接抄）：

```bash
adb logcat -d -b crash -v threadtime          # 1) 只看 crash buffer：最干净，几乎只有崩溃
adb logcat --pid="$PID" -d *:E -v threadtime  # 2) app 进程的 E 级：抓崩溃前自己的错误日志
adb logcat -d -s AndroidRuntime:E System.err:W libc:F -v threadtime   # 3) 按崩溃相关 tag 收窄
adb logcat -d | grep -n -A 40 "FATAL EXCEPTION"   # 4) 兜底：全文定位后取 40 行上下文（-A 给 Caused by 链）
```

注意 `*:E` 之类 filterspec 引号；第 2 步在 app 已死时 pid 无效（pidof 拿不到），这正是"先 1 后 2"的原因。
- Native 崩溃：`libc` 的 `Fatal signal` 行 + tombstone；栈符号化用 `ndk-stack`（官方工具，从 `adb logcat` 输出符号化 native 栈）：`adb logcat -d | ndk-stack -sym <so目录>`。NeriPlayer 含 NDK 构建，此路径适用；ArchiveTune 纯 Kotlin 不需要。**[docs]**（kb://android/ndk/guides/ndk-stack）
- `adb bugreport <目录>` **何时过度**：bugreport 触发 dumpstate 收集 dumpsys+dumpstate+logcat+FS 快照并打包 zip，耗时可达分钟级、体积大——**单个 app 崩溃定位用 logcat 足够，不要默认跑 bugreport**。仅在需要系统级证据（多服务状态、tombstone 原文件、完整 `FS/` 快照、给人类归档/上报）时用；多设备时必须 `-s <serial>`。**[docs]**（kb://android/studio/debug/bug-report：内容构成、`-s` 要求、默认落 `/bugreports` 可 `adb pull`）

## 7. 迭代循环前清缓冲约定

- `adb logcat -c` / `--clear`：清空（flush）**当前 -b 选中的缓冲**并退出。**[AOSP]**
- 约定（**[约定]**，可直接抄进 SKILL.md 的验收循环）：

```
改动 → 安装 → adb logcat -c → 启动 app → 复现 → adb logcat -d --pid=<pid> → 解析
```

清缓冲让本轮 dump 里只剩本次运行的日志，免去时间戳/-T 对齐。两个注意：
1. `-c` 清的是**整机**该缓冲（同设备上其他会话/人的日志也被清），并发多个 agent 会话或有人在旁看日志时慎用；不清也行，改用 `-t N` 或按 threadtime 时间戳过滤。
2. `logcat -c` 同样吃前置 gate：无设备时挂起（**[实测]**，见 §1）。

## 8. Windows 终端：长输出、编码、ANSI

- **[实测]** 本机控制台活动代码页 **936 (GBK)**；logcat 输出是 UTF-8。直接刷终端时，消息体里的中文/emoji 可能乱码或被替换。约定：**dump 重定向到文件再按 UTF-8 读**（`adb logcat -d ... > run.log`），别依赖终端即时解码；需要终端可读时先 `chcp 65001`。
- **[实测]** `adb shell` 输出行尾 CRLF：凡把 shell 输出捕进变量（pid/uid），一律 `tr -d '\r'`。
- **[docs]** `-v color` 是格式修饰符，会注入 ANSI 转义序列——agent **解析时禁用**（转义符会破坏 grep/行首列解析）；人看日志才用。默认 `threadtime` 无色彩、含 PID/TID，是解析最优格式。
- 长输出纪律（**[约定]**）：优先 `-d` 一次性 dump 到文件；文件内用 `grep -n`/`sed -n 'X,Yp'` 分段看，不往终端倾倒全量；流式仅限 §4 的"后台采文件"模式。`-m N` / `-t N` 给输出上界。
- **[实测]** 引号：`*:E`、`ActivityManager:I MyApp:D *:S` 这类 filterspec 在任何 Windows shell 下都整体加引号（`*` 与空格都会被 shell 吃掉）。

## 9. 版本前提

- 本机 adb = platform-tools 36.0.0（`Version 36.0.0-13206524`），scoop shim 优先于 `$ANDROID_HOME\platform-tools\adb.exe`。**[实测]**/ticket 01
- 设备端 logcat 的可用选项**随设备 OS 版本变化**（docs 原文："What options are available will depend on the OS version of the device"）——所以 SKILL 里查 flag 的权威途径是连上设备后跑 `adb logcat --help`（**[实测]**：无设备时该命令挂起，勿在无设备环境跑）。**[docs]+[实测]**
- 本文档 flag 语义以 AOSP main 分支 logcat.cpp help 文本为准（较新设备吻合；老设备以设备端 `--help` 为准）。`--pid` 自 Android 5.0+（logd 时代）可用；`-T/-t/-e/-m` 在近十年设备普遍可用。**[AOSP]**

## 10. 一页速查（SKILL.md 直接抄）

```bash
# 0) gate：无设备时 logcat 只会挂起，必须先确认
adb get-state || exit 1

# 1) 包名按 variant 拼（ArchiveTune debug 加 .debug；NeriPlayer 不变）
PKG=moe.rukamori.archivetune.debug

# 2) package → pid（每轮迭代重新解析；CRLF 必须去）
PID=$(adb shell pidof -s "$PKG" | tr -d '\r')

# 3) dump 本轮日志（清缓冲后的干净读法）
adb logcat -c
adb logcat --pid="$PID" -d -v threadtime > run.log

# 4) crash 优先
adb logcat -d -b crash -v threadtime
adb logcat -d | grep -n -A 40 "FATAL EXCEPTION"

# 5) uid 兜底（多进程）
adb logcat --uid="$(adb shell dumpsys package "$PKG" | grep -o 'userId=[0-9]*' | head -1 | cut -d= -f2 | tr -d '\r')" -d
```

## 来源

- [docs] `android docs fetch kb://android/tools/logcat`（缓冲模型、filterspec、-b、-v、ANDROID_LOG_TAGS、"help 取决于设备 OS"）
- [docs] `android docs fetch kb://android/studio/debug/bug-report`（bugreport 构成、-s、/bugreports）
- [docs] `android docs search` 检索结果含 kb://android/ndk/guides/ndk-stack（native 崩溃符号化）
- [AOSP] https://android.googlesource.com/platform/system/logging/+/refs/heads/main/logcat/logcat.cpp（`--help` 全文与参数解析实现：--pid 单值、-t/-T/-d/-c/-e/-m/--uid 语义与互斥）
- [实测] 本机 adb 36.0.0（Windows 10，无设备）2026-09-24：§1 挂起/快速失败矩阵、flag 顺序陷阱、chcp 936、adb 解析路径
