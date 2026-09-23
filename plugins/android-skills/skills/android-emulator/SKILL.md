---
name: android-emulator
description: Control Android emulators and devices from CLI on Windows — list/create AVDs, headless boot with reliable boot-completed detection, install and launch apps via adb, and parse device states. Use when deploying to, starting, stopping, or provisioning an emulator or physical device.
allowed-tools: Read, Glob, Grep, Bash
---

# android-emulator

## 何时用 / 何时不用

用：`adb devices` 解析、AVD 查询/创建、emulator 启动与 boot 判定、`adb install` 部署、`am start` 启动 app、多设备分支、provision 镜像/AVD。

不用：构建 APK → `android-build`；读日志/崩溃定位 → `android-logcat`（部署后交给它）。

## 版本前提

> **版本前提**（验证于 2026-09-24）：Windows 10、scoop 工具链——adb 36.0.0（scoop shim）与 SDK 内 36.0.2 并存、cmdline-tools sdkmanager 22.0（已弃用）、新 `android` CLI 1.0.16、emulator + android-36 google_apis x86_64 镜像、WHPX 加速。
> 结论按此基线实测；版本漂移时先跑 `adb version` 与 `"$ANDROID_HOME/emulator/emulator.exe" -accel-check` 复核。

## 主路径（速查）

```bash
# 0) 常量：完整路径，勿用裸 shim（见 Windows 专区）
CLT="$ANDROID_HOME/cmdline-tools/latest/bin"
AVDMANAGER="$CLT/avdmanager.bat"
SDKMANAGER="$CLT/sdkmanager.bat"       # 旧 CLI；新 android CLI 的 emulator 域在 Windows 被 disable
EMULATOR="$ANDROID_HOME/emulator/emulator.exe"

# 1) 查目标
adb devices -l                          # 跳过表头解析 serial\tstate；只有表头=无设备（非错误）
"$AVDMANAGER" list avd                  # 空表=无 AVD

# 2) 无镜像/AVD 时（一次性；license 先 yes | "$SDKMANAGER" --licenses）
yes | "$SDKMANAGER" "emulator" "system-images;android-36;google_apis;x86_64"
"$AVDMANAGER" create avd -n api36 -k "system-images;android-36;google_apis;x86_64" -d pixel_6 --force

# 3) headless 启动（确定性迭代禁快照）
"$EMULATOR" -avd api36 -no-window -no-audio -no-boot-anim -gpu swiftshader -no-snapshot &

# 4) 等 boot（务必 timeout；device 状态 ≠ 开机完成）
timeout 300 adb -s emulator-5554 wait-for-device
until [ "$(adb -s emulator-5554 shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done

# 5) 部署 + 启动（包名按变体：注意 applicationId 后缀）
adb -s emulator-5554 install -r -t app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 shell am start -W -n <applicationId>/.MainActivity

# 6) 收尾
adb -s emulator-5554 emu kill
```

## 查询

### `adb devices -l`（部署前必查）

- 第一行恒为 `List of devices attached`；其后每行 `<serial>\t<state>`。解析跳过表头：`awk 'NR>1 && NF>0 {print $1, $2}'`。只有表头 = 无设备，EXIT=0 非错误【实测】。
- state：`device`=已连 adb 但**不代表开机完成**；`offline`=未响应；`unauthorized`=USB 调试未授权【docs】。
- emulator serial 规则 `emulator-<port>`，5554 起每实例 +2【docs】。

### AVD / 平台 / 设备定义

```bash
"$AVDMANAGER" list avd -c          # 紧凑；-c 仅单类列表可用
"$EMULATOR" -list-avds             # 仅 AVD 名
"$AVDMANAGER" list target -c       # 已装平台
"$AVDMANAGER" list device -c       # 设备定义 id（pixel_6、medium_phone…作 -d 参数）
```

空态都 EXIT=0，别把表头/空串当错误【实测】。

## 执行

### 创建 AVD（旧 CLI，agent 可控性最强）

前置：系统镜像先装（§速查步骤 2）。`create avd` 的 `Could not load devices.xml` 报错是装饰性的，AVD 照常创建【实测】。参数全集见 usage（缺 `-n` 时打印）。AVD 落盘 `~/.android/avd/<name>.avd/`【docs】。

### emulator 启动 flag（只能启动时给）【docs】

agent 常用：`-avd <name>`、`-no-window`（headless）、`-no-snapshot`（禁 Quick Boot，冷启+退出丢状态）、`-no-snapshot-load`（本次冷启、退出仍保存）、`-wipe-data`（恢复出厂）、`-gpu swiftshader`（软件渲染，headless 最稳）、`-port 5554`、`-no-boot-anim`/`-no-audio`。

- 确定性迭代用 `-no-snapshot`；快照在 emulator/镜像/AVD 配置任一变更后自动失效转冷启；软件渲染下快照不可靠【docs】。
- 不要照抄 Android Studio 内嵌窗口的 `-qt-hide-window -grpc-use-token` 等 flag【docs】。

### boot 完成判定（核心循环）

`adb devices` 出现 `device` ≠ boot 完成（boot 中 adb 已连接）【docs】。两段式 + timeout：

```bash
timeout 300 adb -s emulator-5554 wait-for-device shell 'while [ -z "$(getprop sys.boot_completed)" ]; do sleep 1; done'
```

`wait-for-device` 无设备时**无限阻塞**，必须包 timeout【实测】。参考量级：android-36 镜像 headless 冷启 ~3 分钟到 `sys.boot_completed=1`【实测】。

### 部署与启动

`adb install [-lrtsdg]`：`-r` replace（迭代默认加）、`-t` 允许 test 包、`-d` 允许降级、`-g` 授全部权限。成功输出 `Success`【docs+实测】。

`am start -W -n <pkg>/<activity>`：`-W` 等待启动完成并输出 `Status:`/`Error:`，`-S` 先 force-stop【docs】。
- 【实测】慢速 emulator（swiftshader）上 `Status: timeout` 而 app 实际已运行——健康判定用 pid 存活 + crash buffer 为空，勿把 timeout 当失败。
- 【实测】`Warning: Activity not started, intent has been delivered to ... top-most instance` + `Status: ok` = 已在前台复用，非错误；manifest activity-alias 重定向时 `Activity:` 字段显示别名，非错配。

## 输出解析 / 设备分支

1. `adb devices -l` 拿 serial 清单。
2. 单台：直接执行。多台且唯一 emulator：`-e`；唯一实体机：`-d`；其他：`-s <serial>` 或 `export ANDROID_SERIAL`。不指定且多台报 `more than one device/emulator`【docs】。
3. emulator 判定：serial 匹配 `^emulator-\d+$`；USB 实体机是十六进制串；WiFi 调试是 `ip:port`。
4. 决策：优先复用已 booted 的 emulator（`device` 状态 + `sys.boot_completed=1`）；无可用目标才走创建/启动分支。

## 失败分类速查（错误串 → 根因 → 处置）【实测】

| 错误输出 / 现象 | 原因 | 处置 |
|---|---|---|
| `adb devices` 仅表头 | 无连接（非错误） | 走启动/创建分支 |
| `adb: no devices/emulators found` | 无目标设备 | 先启 emulator |
| `adb: no emulators found` / `no devices found` | `-e`/`-d` 用错对象 | 换目标选择 |
| `adb: device 'emulator-5554' not found` | serial 不在线 | 重新 `adb devices` |
| `adb wait-for-device` 挂起 | 无设备也阻塞 | 外层 timeout |
| `adb: more than one device/emulator` | 多台未指定 | `-s`/`-e`/`-d` |
| bash 调 `avdmanager`/`sdkmanager` → `The system cannot find the path specified.` | extensionless shim 坏 | 完整路径 `.bat` |
| `Error: The parameter --name must be defined for action 'create avd'` | 缺 `-n` | 补参；usage 即参数全集 |
| `android emulator start <avd>` 无输出挂死 | Windows 上 `android emulator` 域 disabled（docs known issue） | 用 `emulator.exe` |
| `android info` 显示 `%LOCALAPPDATA%\Android\Sdk` 且 `sdk list` 空 | `ANDROID_HOME` 未设→静默错库 | 设 env / `--sdk=<path>` |
| `where.exe emulator` 找不到 | emulator 包未装 | 装后用完整路径 |
| sdkmanager stderr `WARNING: ... deprecated` | 22.0 已弃用 | 正常现象 |
| 启动失败/极慢 | hypervisor/内存/磁盘 | `-accel-check`；查 commit limit（物理 RAM+pagefile）与 5GB 磁盘下限 |

## Windows 专区

- **shim 陷阱**：bash 裸敲 `avdmanager`/`sdkmanager` 报 `The system cannot find the path specified.`——scoop extensionless shim 坏，必须完整 `.bat` 路径。`adb` shim 正常可裸用【实测】。
- **emulator 不在 PATH**：装后在 `$ANDROID_HOME/emulator/emulator.exe`，一律完整路径【实测】。
- **新旧 CLI**：新 `android.exe` 官方推荐，但 `android emulator` 域 Windows disabled、`android sdk list` 有崩溃缺陷、无 `--licenses` 对应——Windows 主路径仍是旧 CLI（sdkmanager/avdmanager/emulator.exe）。包名写法：旧 `system-images;android-36;google_apis;x86_64` 分号式，新斜杠式【docs+实测】。
- **hypervisor**：WHPX（推荐，Win10 1803+）/ AEHD（2026-12-31 sunset）；无提权时装好 emulator 后 `-accel-check` 判定；仅 x86/x86_64 镜像可加速；嵌套 VM 内不可用【docs】。
- **两份 adb 版本漂移**：shim 与 SDK 内版本可能不一致，混用触发 server 重启；固定一个入口【实测】。
- **端口 corner case**：adb server 未运行时以 `-port` 指定奇数端口先启 emulator，可能不出现在 `adb devices`——不手动指定端口，或先 `adb start-server`【docs】。
- `adb shell` 输出 CRLF：捕进变量一律 `tr -d '\r'`【实测】。
