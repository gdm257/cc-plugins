# Prototype the three SKILL.md outlines

## Question

基于三个域的 research 结果，起草 `android-build` / `android-emulator` / `android-logcat` 三个 SKILL.md 的 outline（结构、frontmatter description / 触发词措辞、章节划分、版本前提标注格式），作为给人反应的廉价原型。HITL：用户对结构拍板后才进入正文撰写。同时决定触发词与 description 的最终措辞（map 的 fog 项之一在此毕业）。

Type: prototype
Status: resolved

## Answer

原型：`outlines.md`（`.scratch/android-skills/outlines.md`）。用户拍板三项：

1. description 英文、正文中文（通过）。
2. 版本前提 = 文首 blockquote：验证日期 + 基线清单 + 复核命令（`gradlew.bat --version` / `emulator -accel-check` / `adb version`）——作用是给 agent 过期检测入口（通过，含用途解释）。
3. 骨架顺序：何时用 → 版本前提 → 主路径速查 → 查询 → 执行 → 输出解析 → 失败分类 → Windows 专区；速查前置（通过）。

三 skill 同构；每节标注 research 文档章节号供 06 号撰写时取材。
Blocked by: 02, 03, 04
