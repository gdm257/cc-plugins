# Wayfinder Map: android-skills v1

Label: wayfinder:map

## Destination

一个发布到本 marketplace（`cc-plugins`）的 `android-skills` v1 插件：纯 skills 形态，含 `android-build` / `android-emulator` / `android-logcat` 三个 skill，教会 agent 直接驱动既有 CLI（`gradlew`、`adb`、`emulator`）完成"改代码 → 构建 → 部署 → 读 logcat 定位 → 再改"闭环，并通过在 ArchiveTune 上的严格循环验收。

## Notes

- 本 effort 的 destination 是"就地完成的变更"（shipped plugin），map 携带执行（task tickets），不是纯 spec 交接。
- 已定的形状决策（charting 阶段钉死，后续 session 勿重开）：
  - 纯 skills，零运行时依赖；不做 MCP / LSP / hooks 包装。
  - skill 按域拆三个：`android-build`、`android-emulator`、`android-logcat`，触发词独立。
  - 仅 Claude Code 平台。
  - 内容基线 = ArchiveTune / NeriPlayer 实际工具链版本，skill 内标注版本前提；不追官方最新。
  - skill 正文由 agent 研究产出，研究过程优先用 `android docs` CLI（scoop 已装）检索官方 developer docs，辅以项目实测。
- 参考项目：`~/codebase/ArchiveTune`、`~/codebase/NeriPlayer`（均为多模块 Gradle KTS）。
- 验收标准：严格循环验收——agent 在 ArchiveTune 上完成一个完整迭代，全程无人工介入。
- 域名术语：本 effort 中 "toolchain" 指 skills/约定知识层（teach agent to drive existing CLIs），不是工具包装层。
- 涉及 skill 措辞时可参考 `writing-for-agents`；涉及插件结构时参考仓库内 `steering-skills` / `cc-sdd-skills` 插件作为模板。

## Decisions so far

<!-- one line per closed ticket -->
- [Survey reference projects and local Android toolchain](issues/01-survey-projects-toolchain.md)：版本基线（ArchiveTune AGP 9.3.2/Gradle 9.7.1/JDK 21 三段 flavor 矩阵 + debug 包名后缀；NeriPlayer AGP 9.2.1/Gradle 9.4.1/Java 17/NDK 无 flavor）；SDK 全走 `$ANDROID_HOME`（scoop android-clt，junction 到 D 盘），sdkmanager 22.0 已弃用（新 `android` CLI 1.0.16406183），shim 调用需完整路径；本机无 emulator/AVD/设备——已派生 09 号 provisioning ticket。
- [Research agent-first Gradle CLI conventions](issues/02-research-gradle-cli.md)：`gradlew.bat --console=plain` 为标准调用；ArchiveTune 裸 `assembleDebug` 会 fan-out 全部 20 变体（实测 16 分钟未完成）、必须变体限定（`installGmsMobileUniversalDebug`）；NeriPlayer 在 zulu25 下需 `-Dorg.gradle.java.home=` 前缀；CC ArchiveTune 兼容 / NeriPlayer 不兼容；10 类失败速查表 + FAILURE 输出解析骨架（research/gradle-cli.md）。
- [Research agent-first emulator/device control conventions](issues/03-research-emulator-cli.md)：Windows 上新 `android emulator start` 挂死（docs known issue），主路径 = `avdmanager.bat` + `$ANDROID_HOME\emulator\emulator.exe -no-window`；boot 判定须 timeout 包裹轮询 `sys.boot_completed=1`（wait-for-device 无设备无限阻塞）；新旧 CLI 对照表 + 15 条实测错误串（research/emulator-cli.md）。
- [Research agent-first logcat conventions](issues/04-research-logcat-cli.md)：无设备时 logcat 一切形式永久挂起——须 `adb get-state` gate；CLI 无包名过滤，完整 package→pid 管道（pidof + `tr -d '\r'`，含 `.debug` 后缀）已写成可照抄序列；`-t` 隐含 `-d`、`-T` 续流；crash 优先 `-b crash`；迭代前 `-c`（research/logcat-cli.md）。
- [Provision local emulator and AVD](issues/09-provision-emulator-avd.md)：装好 `emulator` 包 + `system-images;android-36;google_apis;x86_64`（sdkmanager 完整路径，3.5 分钟）；AVD `api36`（pixel_6，WHPX 加速可用）；headless boot 实测 177 秒到 `sys.boot_completed=1`，验收部署目标就绪。
- [Prototype the three SKILL.md outlines](issues/05-skill-outlines.md)：三 skill 同构骨架（何时用 → 版本前提 → 主路径速查 → 查询 → 执行 → 输出解析 → 失败分类 → Windows 专区，速查前置）；description 英文 + 正文中文；版本前提 = 文首 blockquote（验证日期 + 基线清单 + 复核命令）；原型在 `outlines.md`。
- [Author android-skills plugin content](issues/06-author-plugin.md)：`plugins/android-skills/` 三 SKILL.md 全文 + plugin.json + marketplace 登记完成；frontmatter/JSON smoke 通过；机器特定绝对路径已泛化为机制描述。
- [Run strict loop acceptance on ArchiveTune](issues/07-acceptance-loop.md)：验收通过——onCreate 末尾注入标记异常 → crash buffer 单独定位到注入行 → revert 重建重装恢复健康，全程无人工；3 条实测经验已回灌 skill（unreachable 丢 smart-cast 级联报错、`am start -W` timeout ≠ 失败、alias/top-most warning 非错误）。
- [Release android-skills to the marketplace](issues/08-marketplace-release.md)：README Workflows 行新增 + 描述文案定稿（fog 项落点）；marketplace.json 登记复核为 06 号已完成、diff 无额外改动；提交 68a0760（gpg 签名报错按仓库惯例跳过）；jq 解析通过。

## Not yet specified


## Out of scope

- MCP server / hooks / LSP 包装（含 Kotlin LSP——已明确排除出 v1）。
- 单元测试、instrumented test 相关 skills（v2 候选，依赖 emulator/logcat 域稳定）。
- 项目脚手架、Play Store 发布（fastlane 之外不碰发布链路）。
- 多版本 Android 工具链适配（只写项目基线版本，明确标注前提）。
- OpenCode 平台适配。
