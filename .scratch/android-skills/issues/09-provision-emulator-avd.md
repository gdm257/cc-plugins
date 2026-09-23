# Provision local emulator and AVD

## Question

本机当前既无 emulator 包、无 system image、无 AVD、也无连接的实体设备（见 01 号 ticket Answer）。为验收循环提供部署目标：安装 emulator 包与合适 system image（选型记录理由，如 API 级别、ABI、镜像来源），创建并命名一个 AVD，验证 headless 启动到 `sys.boot_completed=1` 后关机。优先用新 Android CLI（`$ANDROID_HOME\cmdline-tools\latest\bin\android.exe`），deprecated 的 `sdkmanager` 作后备；注意 shim 陷阱（用完整 .bat/.exe 路径调用）。答案记录装了什么、AVD 名、启动命令与耗时。

Type: task
Status: resolved
Blocked by: 01

## Answer

- 安装：`sdkmanager.bat`（旧 CLI 实际路径，完整 .bat 调用；`android sdk install` 未用——Windows emulator 域 disabled 且 `sdk list` 有崩溃缺陷，见 research/emulator-cli.md §0）：包 `emulator` + `system-images;android-36;google_apis;x86_64`，含 `--licenses` 预接受，总耗时约 3.5 分钟。
- 选型理由：两项目 targetSdk 36/37、compileSdk 37、minSdk 26 → API 36 google_apis 覆盖验收目标且带 GMS 服务框架；ABI x86_64 匹配本机；google_apis（非 playstore）无需 Google 账号。
- AVD：名 `api36`，device pixel_6，2G RAM，10G data 分区（`~/.android/avd/api36.avd`，实际在 `D:\home\state\.android`）。`avdmanager create` 打印 `Could not load devices.xml` 错误但 AVD 正常创建（config.ini 校验 hw.device.name=pixel_6）——该报错是装饰性的。
- 加速：`emulator -accel-check` → `WHPX(10.0.19045) is installed and usable.`，无需 AEHD/HAXM。
- 启动验证：`emulator.exe -avd api36 -no-window -no-audio -no-boot-anim -gpu swiftshader -no-snapshot` → `adb -e wait-for-device` + 轮询 `sys.boot_completed`，**boot 完成 177 秒**；`adb -e emu kill` 正常关机（"OK: killing emulator"）。serial `emulator-5554`。
- 坑记录：关机日志出现 `Saving snapshot 'default_boot'`（`-no-snapshot` 下仍打印，无害）；`-list-avds` 正常工作。
- 验收循环（07 号 ticket）部署目标就绪：`api36` AVD + WHPX + 177s boot 基线。
