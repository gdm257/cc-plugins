# Research agent-first emulator/device control conventions

## Question

为 `android-emulator` skill 研究 emulator/device 域：用 `avdmanager`/`sdkmanager`/`emulator`/`adb` 完成 AVD 查询与创建、emulator 启动（headless `-no-window` 与窗口模式、等待 boot 完成的判定 `adb wait-for-device` + `sys.boot_completed`）、`adb install -r` 部署、`adb devices` 状态解析、设备 vs emulator 的分支处理、Windows 特有坑（emulator 不在 PATH、HAXM/WHPX、快照）。以 01 号 ticket 事实为准，研究源优先 `android docs` CLI + 本机实测。

Type: research
Status: resolved
Blocked by: 01

## Answer

- 研究文档：[../research/emulator-cli.md](../research/emulator-cli.md)（按查询→创建→启动→boot 判定→部署→失败分类组织；每条标注 [docs]/[实测]，附实测记录与 kb:// 来源）。
- 新旧 CLI 对照：`sdkmanager` 22.0 已弃用（每次运行 stderr WARNING），官方替代 `android.exe`（1.0.16406183）：`sdk install/list/remove/update` ↔ `sdkmanager`，`emulator create/list/remove/start/stop` ↔ `avdmanager`+`emulator.exe`，`install/run`（delta install）↔ `adb install`+`am start`。
- Windows 关键：docs 官方 known issue "`android emulator` on Windows is currently disabled"——实测 `list/create --list-profiles/stop` 可跑但 `emulator start` 挂死无输出；emulator 启动主路径必须走传统 `$ANDROID_HOME/emulator/emulator.exe -avd <name> -no-window ...`（本机未装 emulator 包、不在 PATH）。
- 新 CLI 陷阱：不设 `ANDROID_HOME` 时静默回退 `%LOCALAPPDATA%\Android\Sdk`（本机不存在）→ "no installed packages"；`android sdk list` 实测打印完 Installed packages 后崩（EXIT 0xC0000409）。
- boot 判定：`adb devices` 出现 `device` 状态≠开机完成；用 `adb -s <serial> wait-for-device`（无设备时永久阻塞，实测必须包 timeout）+ 轮询 `getprop sys.boot_completed`=1（注意输出带 CRLF 要 `tr -d '\r'`）。
- `adb devices` 解析：跳过 `List of devices attached` 表头，行格式 `<serial>\t<state>`；state ∈ offline/device/no device；emulator serial 恒为 `emulator-<5554+2n>`；多目标分支 `-e`/`-d`/`-s`。无设备错误串已实测归档（`no devices/emulators found` 等 5 类，见失败分类表）。
- 部署：`adb -s <serial> install -r [-t] <apk>`；包名漂移（ArchiveTune `.debug`/`.nightly` 后缀）只影响 `am start`/logcat/uninstall，不影响 install。
- Windows 坑专区：WHPX 推荐（AEHD 2026-12-31 sunset；本机 `sc query aehd` 1060 未装，WHPX 查询需提权，装好 emulator 后用 `-accel-check` 判定）；快照 `-no-snapshot/-no-snapshot-load/-no-snapshot-save` 语义表；两份 adb 版本漂移（36.0.0 shim vs 36.0.2 SDK）；scoop extensionless shim 调 avdmanager 报 path specified 错，须完整路径 `.bat`。
