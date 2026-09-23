# Research agent-first logcat conventions

## Question

为 `android-logcat` skill 研究 logcat 域：`adb logcat` 的 agent 友好用法——按 pid/package 过滤（`--pid`、package uid 解析）、`-d` dump 模式 vs 流式、ring buffer 与 `-T` 最近 N 条、crash 定位（`*:E`、FATAL EXCEPTION 段解析、`adb bugreport` 何时过度）、清除缓冲时机（循环迭代前 `logcat -c` 的约定）、Windows 终端下长输出与 ANSI 处理。以 01 号 ticket 事实为准，研究源优先 `android docs` CLI + 本机实测。

Type: research
Status: resolved

## Answer

- 研究文档：`.scratch/android-skills/research/logcat-cli.md`（来源逐条标注 docs/AOSP/实测/约定）。
- 最大实测发现：无设备时 `adb logcat` 一切形式（含 `-d`、`-c`、`--help`、显式 `-s`）**永久挂起**输出 `- waiting for device -`，不报错；必须先 `adb get-state`（RC=1 立即失败）做 gate。logcat flag 须放在 `logcat` 子命令之后，放前面会被 adb 当作自身 flag 报 `unknown command`。
- 过滤：filterspec `tag:priority ... *:S`（allowlist 收窄），无包名语法；`--pid=` 仅接受单 pid，多进程走 `--uid=`（dumpsys package 取 userId）；完整 package→pid→过滤管道（pidof -s + tr -d '\r'）已写成可照抄序列；ArchiveTune debug 后缀 `.debug`/`.nightly` 必须拼进包名。
- dump vs 流式：agent 默认 `-d`；`-t N` 最近 N 条并退出（隐含 -d），`-T N` 打完 N 条后继续流式；流式=后台采文件再离线解析。
- crash：优先 `-b crash` → `--pid *:E` → grep "FATAL EXCEPTION" -A 40；native 用 ndk-stack（NeriPlayer）；`adb bugreport` 仅在需要系统级证据时用，单 app 崩溃属过度。
- 迭代约定：安装后 `adb logcat -c` 清缓冲再复现再 dump（注意清的是整机缓冲）；Windows：chcp 936/UTF-8 建议重定向文件读、`adb shell` 输出 CRLF、解析禁用 `-v color`。
Blocked by: 01
