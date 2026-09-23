# android-skills v1 — 三个 SKILL.md outline 原型（ticket 05，待用户拍板）

原型性质：结构草案，非正文。正文撰写（06 号 ticket）在此结构定稿后进行。
素材：research/{gradle,emulator,logcat}-cli.md（章节号引用对应研究文档）。

## 共同约定（三个 skill 一致）

### frontmatter 模板

```yaml
---
name: android-build
description: <见各 skill>
allowed-tools: Read, Glob, Grep, Bash
---
```

### 版本前提标注格式（保鲜注释，置于正文第一节之前）

```markdown
> **版本前提**（验证于 2026-09-24）：Windows 10 / scoop 工具链——Gradle wrapper 9.4.1 与 9.7.1、
> AGP 9.2.1/9.3.2、adb 36.0.0、emulator + android-36 google_apis x86_64、WHPX。
> 结论按此基线实测；版本漂移时先跑 <每 skill 的自检命令> 复核。
```

自检命令：build=`gradlew.bat --version`；emulator=`emulator -accel-check` + `-version`；logcat=`adb version`。
（时间戳 + 基线清单 + 复核入口三要素；不放绝对项目路径，项目名仅作例子。）

### 章节骨架（三文件同构，内容按域替换）

```
# <Skill 名>

## 何时用 / 何时不用        ← 触发边界，与其他两个 skill 互相踢皮球
## 版本前提                  ← 上面的保鲜注释
## 主路径（速查）            ← 10–20 行可照抄命令块（每 skill 的"一页速查"）
## 查询（只读，先看清再动手）
## 执行 / 采集               ← 正确调用姿势 + agent 友好 flag
## 输出解析                  ← stdout 哪段是根因 / 状态怎么读
## 失败分类速查              ← 特征串 → 根因 → 修复 表
## Windows 专区              ← 本机特有坑
```

正文原则：命令可照抄、每条结论带来源标注（【实测】/【docs】/【约定】）、失败表按出现频率排序。

---

## 1. android-build

```yaml
description: Build Android projects with Gradle correctly on Windows — variant-qualified
  tasks (never bare assembleDebug on flavored projects), plain console, failure triage
  (JDK mismatch, version conflicts, file locks), and daemon management. Use when building,
  assembling, or diagnosing Gradle builds in Android repos.
```

触发词/语境：build、assemble、compile、gradle 任务、"构建失败/编译错误"、依赖解析、`--scan`/`tasks`。

章节要点（对应 research/gradle-cli.md）：
- 主路径速查 ← §6（cmd /c gradlew.bat 变体限定任务 --console=plain；NeriPlayer JDK17 前缀）
- 查询 ← §1（settings/flavor 矩阵速读 → :app:tasks --all 抄全名）
- 执行 ← §2（永远 gradlew；变体限定拒绝聚合任务——20 变体 fan-out 教训；flag 表 §2.3；daemon §2.4）
- 输出解析 ← §4（FAILURE 骨架：> Task FAILED 行 → What went wrong 缩进链最深层；plain vs rich）
- 失败分类 ← §5 十类（JDK/版本冲突/内存/文件锁/任务名/签名/submodule/CC/依赖/daemon）
- 增量与 CC ← §3（UP-TO-DATE 语义、CC 兼容性判定，NeriPlayer 禁开）

## 2. android-emulator

```yaml
description: Control Android emulators and devices from CLI on Windows — list/create AVDs,
  headless boot with reliable boot-completed detection, install and launch apps via adb,
  and parse device states. Use when deploying to, starting, stopping, or provisioning an
  emulator or physical device.
```

触发词/语境：emulator、AVD、启动/部署、install、device、boot、headless、"没设备"。

章节要点（对应 research/emulator-cli.md）：
- 主路径速查 ← §9（devices -l → 无 AVD 则装镜像建 AVD → emulator.exe -no-window 后台 → timeout wait-for-device + 轮询 sys.boot_completed → install -r → am start → emu kill）
- 查询 ← §2（adb devices 解析、avdmanager list、新旧 CLI 对照表 §1）
- 执行 ← §3/§4（建 AVD 用 avdmanager.bat 完整路径；Windows 上 android emulator 域 disabled；boot 判定两段式 + timeout）
- 输出解析 ← §2.1（state 含义；device≠booted）+ §6（emulator/USB/WiFi serial 分支）
- 失败分类 ← §7 十五条实测错误串表
- Windows 专区 ← §8（PATH、shim 陷阱、WHPX/AEHD、快照）

## 3. android-logcat

```yaml
description: Read Android logs and locate crashes via adb logcat — device gate before any
  logcat call, package-to-pid filtering (no native package filter in CLI), dump vs stream,
  crash buffer triage, and per-iteration buffer clearing. Use when debugging runtime
  behavior, reading logs, or diagnosing crashes on a device/emulator.
```

触发词/语境：logcat、日志、crash、崩溃、FATAL、运行时错误、"看日志"。

章节要点（对应 research/logcat-cli.md）：
- 主路径速查 ← §10（get-state gate → pidof -s + tr -d '\r' → -c 清缓冲 → -d dump → crash 优先 → uid 兜底）
- 前置 gate ← §1（无设备=永久挂起，不是报错）
- 过滤 ← §2/§3（FILTERSPEC 无包名语法；管道 A/B；pid 每轮重解析；.debug 后缀）
- dump vs 流式 ← §4（-d 默认；-t 隐含 -d；-T 续流；后台采集形态）
- crash 定位 ← §6（-b crash 优先；FATAL EXCEPTION 段结构；bugreport 何时过度）
- Windows ← §8（chcp 936、重定向文件读 UTF-8、CRLF）
