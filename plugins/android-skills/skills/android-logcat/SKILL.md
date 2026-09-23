---
name: android-logcat
description: Read Android logs and locate crashes via adb logcat — device gate before any logcat call, package-to-pid filtering (no native package filter in CLI), dump vs stream, crash buffer triage, and per-iteration buffer clearing. Use when debugging runtime behavior, reading logs, or diagnosing crashes on a device or emulator.
allowed-tools: Read, Glob, Grep, Bash
---

# android-logcat

## 何时用 / 何时不用

用：读日志、运行时行为调试、崩溃定位（Java/Kotlin `FATAL EXCEPTION`、native `Fatal signal`）、迭代循环里的"采集本轮日志"。

不用：构建 → `android-build`；启动 emulator / 安装 → `android-emulator`（装好后启动 app，再回来采日志）。

## 版本前提

> **版本前提**（验证于 2026-09-24）：adb 36.0.0（Windows，scoop shim）；flag 语义以 AOSP main 分支 logcat 实现与官方 docs 为准；设备端可用选项随设备 OS 版本变化（连上设备后 `adb logcat --help` 是权威——无设备时该命令挂起，勿跑）。
> 版本漂移时先跑 `adb version` 复核。

## 主路径（速查）

```bash
# 0) gate：无设备时 logcat 不是报错，是永久挂起
adb get-state || exit 1

# 1) 包名按 variant 拼 applicationId（有的项目 debug 变体加 .debug 后缀）
PKG=moe.rukamori.archivetune.debug

# 2) package → pid（每轮迭代重新解析；CRLF 必须去）
PID=$(adb shell pidof -s "$PKG" | tr -d '\r')

# 3) 干净读法：清缓冲 → 复现 → dump
adb logcat -c
adb logcat --pid="$PID" -d -v threadtime > run.log

# 4) crash 优先
adb logcat -d -b crash -v threadtime
adb logcat -d | grep -n -A 40 "FATAL EXCEPTION"

# 5) uid 兜底（多进程 / pid 拿不到）
adb logcat --uid="$(adb shell dumpsys package "$PKG" | grep -o 'userId=[0-9]*' | head -1 | cut -d= -f2 | tr -d '\r')" -d
```

## 前置 gate（最重要的约定）

无设备时 `adb logcat` 的一切形式（含 `--help`、`-c`）**永久挂起**、stderr 周期打 `- waiting for device -`，不会自己报错退出；而 `adb get-state` **立即** RC=1。所以任何 logcat 调用前先 `adb get-state`，且所有 logcat 调用带超时兜底【实测】。

参数顺序陷阱：logcat 的参数必须全部放在 `logcat` 子命令**之后**——`adb -e FATAL -d` 会被 adb 当成自己的 flag，报 `unknown command FATAL`【实测】。

## 过滤语法

- FILTERSPEC：`tag:priority ...` 空格分隔；priority 是该 tag 的**最低**级别（`V<D<I<W<E<F<S`）。收窄写法 `ActivityManager:I MyApp:D *:S`（末尾 `*:S` 静音其余）【docs+AOSP】。
- `*:E` 等 filterspec 在任何 shell 下**整体加引号**（`*` 与空格会被 shell 吃）【实测】。
- `-s MyTag` = 只看 MyTag；`-e <regex>` 匹配消息体，`-m <N>` 打印 N 条后退出（与 `-t` 互斥）【AOSP】。
- **CLI 没有按包名过滤的语法**（`package:` 是 Android Studio 窗口的语法）——必须走 pid/uid 管道【docs】。
- `--pid` 只接受一个值；多进程用 `--uid=uid1,uid2`（纯数字）【AOSP】。
- 输出格式默认 `threadtime`（date time priority tag PID TID）即解析最优；**禁用 `-v color`**（ANSI 转义破坏 grep）【docs】。

## package → pid 管道

- 包名取 **applicationId**（按 variant 拼：debug 变体常有 `.debug`/`.nightly` 类后缀），不是模块名。
- pid 每轮迭代重新解析（重装/重启后 pid 必变，不要缓存）。
- pid 解析失败三种含义：包名拼错（忘后缀）/ app 崩溃已退出（转 crash 定位）/ 未安装。
- `tr -d '\r'` 不可省：adb shell 输出 CRLF，CR 混进 `--pid=` 即非法【实测】。

## dump vs 流式；-t / -T

- `-d`：dump 当前缓冲并退出——**agent 默认形态**（输出有界、可整读、可 grep）【AOSP】。
- `-t <N>`：最近 N 行并退出（隐含 `-d`）；`-T <N>`：最近 N 行后**继续流式跟随**【AOSP】。
- 需要观察"复现期间"日志时：后台采文件，复现后 kill 再离线解析：

```bash
adb logcat --pid="$PID" -T 1 -v threadtime > run.log 2>&1 &
# ... 触发复现 ...
kill %1 && grep -nE "FATAL|Exception" run.log
```

## ring buffer 语义

- 日志是 logd 的循环缓冲：`main`（应用）、`system`（OS）、`crash`（崩溃）为主；另有 radio/events/kernel/security。默认读 main,system,crash（+kernel，随设备）——跨设备脚本显式 `-b`【docs+AOSP】。
- `-b <buf>` 可多次或逗号分隔（`-b main,crash`）；`-b all` 全部【docs】。
- ring 会滚动覆盖：复现后**尽快 dump**；被覆盖的历史拿不回来，更长历史才考虑 bugreport【约定】。

## crash 定位（从窄到宽）

```bash
adb logcat -d -b crash -v threadtime          # 1) crash buffer 最干净，app 已死也有效
adb logcat --pid="$PID" -d '*:E' -v threadtime  # 2) app 进程 E 级（需 app 还活着）
adb logcat -d -s AndroidRuntime:E System.err:W libc:F -v threadtime   # 3) 崩溃相关 tag 收窄
adb logcat -d | grep -n -A 40 "FATAL EXCEPTION"   # 4) 兜底：全文定位取 40 行上下文
```

- Java/Kotlin 崩溃段：`FATAL EXCEPTION: <thread>` → `Process: <pkg>, PID: <n>` → 栈帧 → 可选 `Caused by:` 链（`grep -A` 要给够上下文行）【docs+约定】。
- Native 崩溃：`libc` 的 `Fatal signal` 行 + tombstone；符号化 `adb logcat -d | ndk-stack -sym <so目录>`（仅 NDK 项目需要）【docs】。
- `adb bugreport` **不要默认跑**：dumpstate 全量收集，分钟级耗时且体积大。仅需要系统级证据（多服务状态、tombstone 原文件）时用；多设备必须 `-s <serial>`【docs】。

## 迭代循环约定

```
改动 → 安装 → adb logcat -c → 启动 app → 复现 → adb logcat -d --pid=<pid> → 解析
```

清缓冲让本轮 dump 只含本次运行，免时间戳对齐。注意 `-c` 清的是**整机**该缓冲（同设备其他会话的日志也被清），并发会话/有人在旁看日志时改用 `-t N` 或按时间戳过滤【约定】。

## Windows 专区

- 控制台代码页 936 (GBK)，logcat 输出 UTF-8——dump **重定向到文件再按 UTF-8 读**，别依赖终端即时解码；需终端可读先 `chcp 65001`【实测】。
- `adb shell` 输出 CRLF：捕进变量（pid/uid）一律 `tr -d '\r'`【实测】。
- 长输出纪律：`-d` 一次性 dump 到文件，文件内 `grep -n`/`sed -n 'X,Yp'` 分段看，不往终端倾倒全量【约定】。
