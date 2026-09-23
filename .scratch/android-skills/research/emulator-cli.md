# Research: emulator/device 域 agent-first CLI 约定（ticket 03）

目标：为 `android-emulator` skill 提供可直接抄进 SKILL.md 的命令、输出解析与失败分类。范围：AVD 查询/创建、emulator 启动（headless/窗口 + boot 判定）、`adb install -r` 部署、`adb devices` 解析、设备 vs emulator 分支、Windows 坑。

- 事实基线：`../issues/01-survey-projects-toolchain.md` 的 Answer（版本/路径以该基线为准）。
- 每条结论标注来源：**[docs]** = 官方 developer docs（经 `android docs search/fetch` 检索，kb:// URL 附后）；**[实测]** = 本机 2026-09-24 实际运行输出（本机无 emulator、无 AVD、无设备，实测仅限 help/list/无设备错误行为）。
- 文中 `$ANDROID_HOME` = `C:\Users\demo\scoop\apps\android-clt\current`。bash 中写法 `"$ANDROID_HOME/cmdline-tools/latest/bin/android.exe"`；cmd/PowerShell 中 `%ANDROID_HOME%\cmdline-tools\latest\bin\android.exe`。

## 0. 版本前提与入口（实测，基线 01）

| 工具 | 本机版本 | 入口 | 状态 |
|---|---|---|---|
| adb（scoop shim 优先） | 36.0.0-13206524 | `adb`（`C:\Users\demo\scoop\shims\adb.exe`） | 可用 |
| adb（SDK 内第二份） | 36.0.2-14143358 | `$ANDROID_HOME/platform-tools/adb.exe` | 可用，版本与 shim 不一致 |
| sdkmanager | 22.0 | `$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager.bat` | **已弃用**，每次运行 stderr 打 WARNING |
| android CLI（新） | 1.0.16406183 | `$ANDROID_HOME/cmdline-tools/latest/bin/android.exe` | 官方替代（`android sdk` 替代 sdkmanager） |
| avdmanager | cmdline-tools 自带 | `$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager.bat` | 可用 |
| emulator | **未安装** | `where.exe emulator` → `Could not find "emulator"` | `$ANDROID_HOME/emulator/` 目录不存在；`system-images/` 为空 |
| AVD / 连接设备 | 无 | `avdmanager list avd` 空表；`adb devices` 仅表头 | provisioning 归 ticket 09 |

关键实测事实：

- sdkmanager 弃用警告原文（stderr，EXIT 仍为 0/1 不定）：
  `WARNING: The SDK Manager CLI tool (sdkmanager) is deprecated. Use Android CLI instead. The 'android' binary can also be found in the cmdline-tools directory, and 'android sdk' is the replacement for 'sdkmanager'.`（官方文档 https://d.android.com/tools/agents/android-cli ）**[实测]**
- **scoop shim 陷阱**：bash 直接敲 `avdmanager`/`sdkmanager`（extensionless shim）报 `The system cannot find the path specified.`；必须用完整路径 `.bat`。`adb`/`where` 正常。**[实测，基线 01]**
- **新 android CLI 的 SDK 定位**：读 `ANDROID_HOME` 环境变量（设了就生效）；未设时回退 `%LOCALAPPDATA%\Android\Sdk`（本机不存在）——此时 `android info` 显示不存在的路径、`android sdk list` 显示 `(no installed packages)`，**静默错库**。兜底：确保 `ANDROID_HOME` 已设，或每次传 `--sdk=<path>`，或写 `%USERPROFILE%\.androidrc`（每行一个 flag，如 `--sdk=...`）。**[实测 + docs: kb://android/tools/agents/android-cli/index]**
- **docs 官方 Known issue：`android emulator` 命令在 Windows 上 "currently disabled"**。实测补充：`list`/`create --list-profiles`/`stop` 在 Windows 实际能跑；`emulator start <不存在的AVD>` 无任何输出挂死（45s+ 无返回）。⇒ Windows 上 skill 的 emulator 启动路径必须以传统 `emulator.exe` 为主，`android emulator start` 仅作非 Windows 备选。**[docs Known issues + 实测]**
- `android emulator stop`（无实例运行）→ EXIT=0，输出 `There are currently no local emulator running`。**[实测]**

## 1. 新旧 CLI 对照表（skill 迁移核心）

旧 = `sdkmanager`/`avdmanager`（cmdline-tools .bat）；新 = `android.exe`（Android CLI 1.0.x）。**[docs: kb://android/tools/agents/android-cli/index + 各 --help 实测]**

| 任务 | 旧（仍可用） | 新（官方推荐） | 备注 |
|---|---|---|---|
| 列已装/可装 SDK 包 | `sdkmanager --list` | `android sdk list [pattern] [--all] [--all-versions]` | pattern 支持 `*`；新 CLI 旧包名 `system-images;...;x86_64` → `system-images/android-35/google_apis/x86_64`（斜杠式） |
| 装 SDK 包/系统镜像 | `sdkmanager "system-images;android-35;google_apis;x86_64"` | `android sdk install system-images/android-35/google_apis/x86_64` `[@版本] [--canary\|--beta] [--force]` | 详见 docs 示例 |
| 卸载/更新 | `sdkmanager --uninstall` / `--update` | `android sdk remove <pkg>` / `android sdk update [pkg]` | update 不带参数=全量更新 |
| 接受 license | `sdkmanager --licenses` | **无对应子命令** | 新 CLI 未提供；缺 license 时行为未验证 |
| 列 AVD | `avdmanager list avd`（空表 `Available Android Virtual Devices:`） | `android emulator list [--long]`（空→stdout 为空；`--long` 出表头 `AVD ID / AVD Name / API Level / Status / Serial`） | 两者空态都 EXIT=0，解析时别把表头/空串当错误 **[实测]** |
| 建 AVD | `avdmanager create avd -n <name> -k "system-images;<api>;<tag>;<abi>" [-d <device>] [-f]` | `android emulator create [--profile=medium_phone]`；`--list-profiles` 列 profile | 语义不同：旧=指定系统镜像包路径；新=设备 profile（默认 `medium_phone`），镜像由 CLI 自行解析/下载（Windows 上被 disable，不可依赖） |
| 删 AVD | `avdmanager delete avd -n <name>` | `android emulator remove <name>` | — |
| 启动 emulator | `emulator -avd <name> [flags]`（后台进程，需自行判定 boot） | `android emulator start <avd> [--headless] [--cold]`，**返回时机=fully started** | 新 CLI 省掉 boot 轮询，但 Windows disabled |
| 停 emulator | 关窗口 / `adb -s emulator-5554 emu kill` | `android emulator stop [<name\|serial>]`（无实例 EXIT=0 提示语） | — |
| 装 APK | `adb install -r app.apk` | `android install --apks=app.apk [--device=serial] [--install-options=-g,-d]`（delta install 默认开，快于 adb） | 见 §5 |
| 装+启动 | adb install + `am start` 两条 | `android run --apks=app.apk [--activity=.Main] [--device=serial] [--type=ACTIVITY]` | run 不构建，只部署 |
| 列设备 | `adb devices [-l]` | `android info`（只给 sdk 路径，不含设备清单；help 文案提到 connected devices 但实测 info 只有 sdk/version 两行） | 设备查询仍以 `adb devices` 为准 |

## 2. 查询：设备与 AVD 现状

### 2.1 `adb devices`（部署前必查）**[docs: kb://android/tools/adb + 实测]**

```bash
adb devices -l
```

输出格式与解析规则：

```
List of devices attached
emulator-5556 device product:sdk_google_phone_x86_64 model:Android_SDK_built_for_x86_64 device:generic_x86_64
emulator-5554 device product:sdk_google_phone_x86 model:Android_SDK_built_for_x86 device:generic_x86
0a388e93      device usb:1-1 product:razor model:Nexus_7 device:flo
```

- 第一行恒为 `List of devices attached`；其后每行 `<serial>\t<state>`（`-l` 追加 key:value 描述）。
- state 取值：`offline`（未连接/无响应）、`device`（已连 adb；**不代表系统已完全开机**——adb 在 boot 中即连接）、`no device`。docs 另有 `unauthorized`（未授权 USB 调试）场景。
- **解析**：跳过表头行；`awk 'NR>1 && NF>0 {print $1, $2}'`。只有表头=无设备（EXIT=0，非错误）**[实测]**。
- **emulator serial 规则**：`emulator-<consolePort>`，端口从 5554 起每实例 +2（5554/5555, 5556/5557 …，上限 64 个实例）。窗口/无窗口不影响 serial。**[docs]**

### 2.2 AVD 查询

```bash
# 传统路径（Windows 可用）
"$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager.bat" list avd          # 人类可读
"$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager.bat" list avd -c       # 紧凑（脚本友好）※-c 仅单类列表可用
emulator -list-avds                                                        # 仅 AVD 名，一行一个（需先装 emulator 包）
# 新 CLI
"$ANDROID_HOME/cmdline-tools/latest/bin/android.exe" emulator list --long # 表格：AVD ID/AVD Name/API Level/Status/Serial
```

实测空态：`avdmanager list avd` → `Available Android Virtual Devices:` 后空，EXIT=0；`android emulator list` → 空输出 EXIT=0；`--long` → 只有表头行。**[实测]**

辅助：`avdmanager list target -c` 列已装平台（本机 `android-31`…`android-37.0`，注意 37 带版本后缀 `.0`）；`avdmanager list device -c` 列设备定义（`pixel_6`、`medium_phone` 等，可作 `-d` 参数）。**[实测]**

## 3. 创建 AVD

前置：系统镜像必须先装（本机 `system-images/` 为空）：

```bash
# 新 CLI（推荐，非 Windows；Windows 上 emulator 域被 disable）
"$ANDROID_HOME/cmdline-tools/latest/bin/android.exe" sdk install "system-images/android-36/google_apis/x86_64"   # [docs 示例改写]
# 旧 CLI（Windows 实际可用的路径）
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager.bat" "system-images;android-36;google_apis;x86_64"
```

创建（两条等价目标，按平台选）：

```bash
# 旧：完全指定（agent 可控性最强；Windows 用这条）
"$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager.bat" create avd \
  -n test_api36 -k "system-images;android-36;google_apis;x86_64" \
  -d pixel_6 --force
# 新：profile 驱动（默认 medium_phone；--list-profiles 实测输出：
#   large_desktop medium_desktop medium_phone medium_tablet small_desktop small_phone）
"$ANDROID_HOME/cmdline-tools/latest/bin/android.exe" emulator create --profile=medium_phone
```

- 旧 CLI 参数全集（实测 usage）：`-n/--name`（必填）、`-k/--package`（系统镜像包路径，分号分隔）、`-d/--device`（设备定义 id）、`-b/--abi`、`-g/--tag`、`-c/--sdcard`（路径或 `1000M`）、`-p/--path`、`--force`、`--skin`。**[实测 + docs: kb://android/tools/avdmanager]**
- 缺 `-n` 时：EXIT=1，stderr `Error: The parameter --name must be defined for action 'create avd'` + 完整 usage。**[实测]**
- 新 CLI create 在 Windows 上属被 disable 的 `android emulator` 域，勿依赖。**[docs Known issues]**
- AVD 落盘位置：`~/.android/avd/<name>.avd/`（本机 `~/.android` junction → `D:\home\state\.android`，基线 01）。**[docs + 基线]**

## 4. 启动 emulator 与 boot 完成判定

### 4.1 传统 `emulator.exe`（Windows 主路径）**[docs: kb://android/studio/run/emulator-commandline]**

前置：`android sdk install emulator`（或旧 `sdkmanager "emulator"`）；装完后二进制在 `$ANDROID_HOME/emulator/emulator.exe`——**不在 PATH**，一律完整路径调用（本机当前未装，`where.exe emulator` 找不到，实测）。

```bash
EMULATOR="$ANDROID_HOME/emulator/emulator.exe"

"$EMULATOR" -list-avds                                   # 列 AVD 名
"$EMULATOR" -avd test_api36 -no-window -no-audio -no-boot-anim \
            -gpu swiftshader -no-snapshot -port 5554 &    # headless（服务器/CI 模式）
"$EMULATOR" -avd test_api36 &                             # 窗口模式（默认）
```

agent 最常用的 startup options（只能启动时给，运行中不可改）：

| flag | 语义 | 来源 |
|---|---|---|
| `-avd name` / `@name` | 指定 AVD | docs |
| `-no-window` | 无窗口（headless），仍可 adb/console 访问 | docs |
| `-no-snapshot` | 完全禁用 Quick Boot：不加载也不保存快照（冷启 + 退出丢状态） | docs |
| `-no-snapshot-load` | 本次冷启动，退出时仍保存（下次可 quick boot） | docs |
| `-no-snapshot-save` | 尽量 quick boot，退出不保存 | docs |
| `-wipe-data` | 恢复出厂（清 userdata，不动 sdcard） | docs |
| `-gpu mode` | `auto`/`host`/`software`/`swiftshader`/`swangle`/`lavapipe`；`angle_indirect`、`swiftshader_indirect`、`guest` 等 36.4.9 起弃用 | docs |
| `-accel auto\|on\|off` + `-accel-check` | VM 加速；x86/x86_64 镜像才生效 | docs |
| `-memory 1536..8192` | 覆盖 AVD 内存 | docs |
| `-port 5554` / `-ports console,adb` | 端口对（偶数 console，+1 adb） | docs |
| `-no-boot-anim` / `-noaudio` | 提速/绕过坏声卡驱动 | docs |
| `-no-snapshot-update-time` | 快照恢复不做时间跳变（测试稳定性） | docs |

注意（docs）：Android Studio 内嵌窗口用的 `-qt-hide-window -grpc-use-token` 等参数**不要**照抄。停止：关窗口，或 `adb -s emulator-5554 emu kill`。

### 4.2 boot 完成判定（skill 的核心循环）

`adb devices` 里出现 `device` 状态**不等于**开机完成（docs 明示：device connects to adb while the system is still booting）。标准两段式：

```bash
adb -s emulator-5554 wait-for-device          # 阻塞直到 serial 出现在 adb 里（⚠ 无设备时永久阻塞，实测 60s+ 不返回）
adb -s emulator-5554 shell getprop sys.boot_completed   # 轮询直到输出 "1"
```

一步写法（在设备侧循环，减少往返）：

```bash
adb -s emulator-5554 wait-for-device shell 'while [ -z "$(getprop sys.boot_completed)" ]; do sleep 1; done'
```

- `sys.boot_completed=1` 是 Android 系统属性惯例（官方工具链/AGP 通用约定）；docs 未单列该属性，但明确 device 状态≠boot 完成。**[docs 佐证 + 惯例]**
- `wait-for-device` 无设备时**无限阻塞**（实测超时杀掉）⇒ agent 必须包一层 timeout（如 `timeout 300 adb ... wait-for-device`）。**[实测]**
- 补充判定（可选）：`getprop dev.bootcomplete`、锁屏状态 `dumpsys window | grep mDreamingLockscreen`；launch 前还可用 `adb shell input keyevent 82` 解锁。**[惯例，非 docs]**

### 4.3 新 CLI 启动（非 Windows 或 CLI 修复后）

```bash
android emulator start medium_phone --headless   # = -no-window
android emulator start medium_phone --cold       # = 不加载快照（-no-snapshot-load）
```

help 明示「returns when the emulator is fully started and ready to use」——省掉 §4.2 轮询。但 Windows 上该域 disabled（§0），且实测 `start <不存在AVD>` 挂死无输出。**[docs + 实测]**

## 5. 部署：`adb install -r` 与变体

### 5.1 adb install（通用主路径）**[docs: kb://android/tools/adb + adb help 实测]**

```bash
adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
```

flags（`adb help` 实测原文）：`install [-lrtsdg] [--instant] PACKAGE`

- `-r` replace existing application（**agent 迭代默认加**）
- `-t` allow test packages（debug 变体的 test APK 必加；docs 强调）
- `-d` 允许 version code 降级（仅 debuggable 包）
- `-g` 授予全部运行时权限
- 多 APK：`install-multiple [-lrtsdpg]`；`uninstall [-k] PACKAGE`
- 成功输出 `Success`；无设备时 EXIT=1 `adb.exe: no devices/emulators found`（实测）

### 5.2 变体 → APK 路径与包名（连到基线 01）

- `adb install` 本身不需要包名；**包名漂移只影响后续 `am start`/`logcat`/`uninstall`**：ArchiveTune debug 后缀 `.debug`（如 `moe.rukamori.archivetune.debug`）、nightly `.nightly`；NeriPlayer 固定不变。
- APK 产物路径随变体：ArchiveTune 形如 `app/build/outputs/apk/gmsMobileUniversal/debug/app-gms-mobile-universal-debug.apk`（flavor 三段拼接）；NeriPlayer `app/build/outputs/apk/debug/app-debug.apk`。**[基线 01]**

### 5.3 启动 app

```bash
adb -s emulator-5554 shell am start -W -n moe.rukamori.archivetune.debug/.MainActivity.kt
# -W 等待启动完成并输出 Status/Error；-n pkg/activity；-S 先 force-stop
```

**[docs: adb am 命令表]**。新 CLI 替代：`android run --apks=<apk>[,apk2] [--activity=.Main] [--device=serial]`（delta install，增量快）；`android install --apks=... --install-options=-g`。**[docs + help 实测]**

## 6. 设备 vs emulator 分支处理 **[docs: kb://android/tools/adb + 实测错误]**

1. 先 `adb devices -l` 拿 serial 清单。
2. 分支规则（adb 全局选项，置于子命令前）：
   - 只有 1 台（任意类型）：直接执行，adb 自动选它。
   - 多台且唯一 emulator：`adb -e <cmd>`；多台且唯一实体设备：`adb -d <cmd>`。
   - 其他多台场景：`adb -s <serial> <cmd>`；或 `export ANDROID_SERIAL=<serial>`（`-s` 优先于环境变量）。
   - 不指定且多台：报错 `adb: more than one device/emulator`。
3. emulator 判定：serial 匹配 `^emulator-\d+$`（`-l` 描述里 `product:sdk_google_phone_*` 亦可佐证）；USB 实体机 serial 为十六进制串（如 `0a388e93`），WiFi 调试为 `ip:port`（如 `0.0.0.0:6520`）。
4. skill 决策建议：优先复用已 booted 的 emulator（`device` 状态 + `sys.boot_completed=1`）；无可用目标时才走创建/启动分支。

## 7. 失败分类表（错误字符串 → 原因 → 处置）

全部实测（本机无设备环境），EXIT 码一并给出：

| 错误输出 / 现象 | EXIT | 原因 | 处置 |
|---|---|---|---|
| `adb devices` 仅 `List of devices attached` 表头 | 0 | 无任何连接（非错误） | 走启动/创建分支 |
| `adb.exe: no devices/emulators found`（install/uninstall 等无 `-s`） | 1 | 无目标设备 | 先启 emulator 或插设备 |
| `adb.exe: no emulators found` | 1 | 用了 `-e` 但无 emulator | 同上 |
| `adb.exe: no devices found` | 1 | 用了 `-d` 但无实体设备 | 改用 emulator |
| `adb.exe: device 'emulator-5554' not found` | 1 | `-s` 的 serial 不在线（未启/已关） | 重新 `adb devices` 取 serial |
| `adb wait-for-device` 永久挂起 | — | 无设备也阻塞 | 外层 `timeout`；或先查 `adb devices` |
| `adb: more than one device/emulator` | 1 | 多台未指定目标 | 加 `-s`/`-e`/`-d` |
| `Error: The parameter --name must be defined for action 'create avd'`（附 usage） | 1 | avdmanager create 缺 `-n` | 补 `-n`；usage 即参数全集 |
| bash 调 `avdmanager`/`sdkmanager` → `The system cannot find the path specified.` | — | scoop extensionless shim 坏 | 用完整路径 `.bat`（§0） |
| `android emulator list` 空输出 / `--long` 仅表头 | 0 | 无 AVD（非错误） | 走创建分支 |
| `android emulator start <avd>` 无输出挂死 | — | Windows 上 `android emulator` 域 disabled（docs known issue） | Windows 改用 `emulator.exe`（§4.1） |
| `android sdk list` 打印完 Installed packages 后 EXIT 0xC0000409、无 stderr | 3221226505 | 远端仓库拉取阶段崩溃（CLI 1.0.16406183 缺陷） | 已打印部分仍可用；重试或退回 `sdkmanager --list` |
| `android info` 显示 `%LOCALAPPDATA%\Android\Sdk`、`sdk list` 显示 `(no installed packages)` | 0 | `ANDROID_HOME` 未设 → 回退默认路径 | 设 env / `--sdk` / `.androidrc`（§0） |
| `where.exe emulator` → `Could not find "emulator"` | 1 | emulator 包未安装/不在 PATH | `android sdk install emulator` 后用完整路径 |
| sdkmanager 每次运行 stderr `WARNING: ... deprecated ...` | 0/1 | 22.0 已弃用 | 正常现象；新代码用 `android sdk` |
| `sc query aehd` → `FAILED 1060: 指定的服务未安装` | 1060 | AEHD hypervisor 未装 | 见 §8；WHPX 查询需管理员 |

## 8. Windows 专区坑

1. **emulator 不在 PATH 且未安装**：`$ANDROID_HOME/emulator/` 不存在；装后也只在该目录。所有调用走 `"$ANDROID_HOME/emulator/emulator.exe"`。**[实测 + 基线 01]**
2. **hypervisor（VM 加速）**：**[docs: kb://android/studio/run/emulator-acceleration]**
   - 官方推荐 **WHPX**（Windows Hypervisor Platform，Win10 1803+，"Turn Windows features on and off" 勾选后重启）；**AEHD**（原 GVM，`sc query aehd`，SDK Manager 可装）**2026-12-31 sunset**；旧 HAXM 已出局（docs `-accel` 描述仍提 HAXM 属遗留文案）。
   - 自检：`emulator -accel-check` → `WHPX(10.0.xxxxx) is installed and usable.` / AEHD 字样。无 emulator 二进制时无法自检；本机 `sc query aehd` 1060（未装）；`Get-WindowsOptionalFeature -FeatureName HypervisorPlatform` 需管理员（实测 `requires elevation`）⇒ **agent 无提权时只能装好 emulator 后靠 `-accel-check` 判定**。
   - 仅 x86/x86_64 镜像可加速；嵌套 VM（VirtualBox/VMware/容器内）不可用。
   - 失败症状：启动失败/极慢 → 先查 commit limit（物理 RAM+pagefile，guest 内存全额计入）与 5GB 磁盘下限。**[docs: emulator-troubleshooting]**
3. **快照**：默认 Quick Boot 自动 save/load（首启必冷启）。确定性迭代建议 `-no-snapshot`（或一次性 `-no-snapshot-load`）；emulator/系统镜像/AVD 配置任一变更都会使快照失效并自动转冷启；软件渲染下快照不可靠。**[docs: kb://android/studio/run/emulator-snapshots]**
4. **两份 adb 版本漂移**：shim 36.0.0 vs SDK 36.0.2。混用可能触发 server 版本不匹配重启；skill 固定一个入口（建议 `adb` shim，或一律 `$ANDROID_HOME/platform-tools/adb.exe`）。**[实测]**
5. **adb server 启动顺序 corner case**：adb server 未运行时，先以 `-port` 指定奇数端口启动 emulator 再起 adb，emulator 可能不出现在 `adb devices`。规避：不手动指定端口，或先 `adb start-server` / 事后 `adb kill-server && adb devices`。**[docs: adb "Emulator not listed"]**
6. **音频驱动坑**：个别 Windows 声卡驱动阻止 emulator 启动 → `-noaudio`。**[docs]**

## 9. SKILL.md 速查（推荐主路径，Windows 本机验证过的写法）

```bash
# 0) 常量
CLT="$ANDROID_HOME/cmdline-tools/latest/bin"
AVDMANAGER="$CLT/avdmanager.bat"          # bash 调 .bat；勿用裸 shim
ANDROID="$CLT/android.exe"
ADB="adb"                                  # 或 $ANDROID_HOME/platform-tools/adb.exe（二选一固定）

# 1) 查目标
$ADB devices -l                            # 解析: 跳过表头; serial\tstate
"$AVDMANAGER" list avd                     # 空表=无 AVD

# 2) 无系统镜像/AVD 时（一次性）
"$ANDROID" sdk install "system-images/android-36/google_apis/x86_64"   # 新 CLI（bash 引号整串）
"$AVDMANAGER" create avd -n api36 -k "system-images;android-36;google_apis;x86_64" -d pixel_6 --force  # Windows 建用旧 CLI

# 3) 启动（headless，禁快照；Windows 主路径）
"$ANDROID_HOME/emulator/emulator.exe" -avd api36 -no-window -no-audio -no-boot-anim -gpu swiftshader -no-snapshot &

# 4) 等 boot（务必 timeout）
timeout 300 $ADB -s emulator-5554 wait-for-device
until [ "$($ADB -s emulator-5554 shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done

# 5) 部署 + 启动（包名按变体：注意 .debug/.nightly 后缀）
$ADB -s emulator-5554 install -r -t app/build/outputs/apk/debug/app-debug.apk
$ADB -s emulator-5554 shell am start -W -n <pkg.debug>/.MainActivity

# 6) 收尾
$ADB -s emulator-5554 emu kill             # 或 android emulator stop emulator-5554（非 Windows）
```

（`tr -d '\r'`：adb shell 输出带 CRLF，比较前要去掉——Windows 下尤其如此。）

## 附：本次实测记录摘要（2026-09-24）

- `android -V` → `1.0.16406183`；`android info`（env 有/无 `ANDROID_HOME` 两种结果如 §0）。
- `android emulator list`（空）/`list --long`（表头）/`create --list-profiles`（6 个 profile）/`stop`（"no local emulator running"）。
- `android emulator start no_such_avd_xyz` → 45s 无输出超时（进程被杀，未安装任何组件）。
- `android sdk list`（`--sdk` 指向后）→ 17 行 Installed packages 后 EXIT 3221226505。
- `avdmanager list avd|target -c|device -c`、`create avd` 缺参 usage、`sdkmanager --version/--help`（弃用警告）。
- `adb`（shim 与 SDK 两份）`--version`、`devices`/`devices -l`、install/uninstall/-e/-d/-s 五类无设备错误、`wait-for-device` 挂起、`help` install 块。
- `where.exe adb/avdmanager/sdkmanager/emulator`；`sc query aehd/whpx`（1060）；`Get-WindowsOptionalFeature`（需提权）。

主要 docs 来源（kb:// 经 `android docs fetch`，对应 developer.android.com 同路径）：
`tools/adb`、`tools/avdmanager`、`studio/run/emulator-commandline`、`studio/run/emulator-acceleration`、`studio/run/emulator-snapshots`、`studio/run/emulator-comparison`、`studio/run/emulator-troubleshooting`、`tools/agents/android-cli/index`、`tools/releases/cmdline-tools`。
