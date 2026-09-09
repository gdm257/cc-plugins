---
name: trellis-init
description: "Bundled required and optional `.trellis/` template so trellis skills work in projects that have not run `trellis init`. Use as a fallback whenever a trellis skill or script needs any `.trellis/*` initial files or the project has no `.trellis/` directory."
---

Bootstrap or converge a project onto the canonical `.trellis/` layout. Covers both a fresh project and an existing single-repo converting to monorepo — the target state is the same.

## Target layout

`.trellis/` always lives at the repo root, single-repo or monorepo. Items marked `# monorepo` exist only when packages are declared in `config.yaml`.

```
.trellis/
├── config.yaml              # declares packages: / default_package: when monorepo
├── .developer
├── .version
├── .gitignore
├── workflow.md
├── workspace/
│   ├── index.md
│   └── {developer}/         # journal-*.md, session traces
├── spec/
│   ├── guides/              # shared thinking guides, never per-package
│   ├── frontend/            # single-repo: spec/<layer>/
│   ├── backend/
│   ├── my-app/frontend/     # monorepo: spec/<package>/<layer>/
│   └── my-app/backend/      # monorepo
└── tasks/
    └── <task>/              # task.json gains a "package" field when monorepo
```

## Fresh project

1. Copy from `resources/.trellis/`:

   Required:

   - `spec/guides/`
   - `.gitignore`
   - `workspace/`

   Optional (skip if not needed):

   - `spec/frontend/`, `spec/backend/`
   - `tasks/`
   - `.version`
   - `config.yaml`
   - `workflow.md` — only if the project will customize it

2. Generate the developer identity — never copy `.developer` from templates or another project:

   ```bash
   uvx trellis-runtime init-developer $(git config user.name)
   ```

3. Add global git attributes once per machine:

   ```bash
   echo '.trellis/workspace/*/journal-*.md merge=union' >> ~/.config/git/attributes
   ```

## Existing repo converting to monorepo

Converge onto the target layout:

1. `config.yaml`: add `packages:` (name → path) and `default_package:`. Hand-editing is the supported escape hatch; `trellis init` won't overwrite an existing config.
2. Spec layout: move `spec/<layer>/` → `spec/<package>/<layer>/` per package. `spec/guides/` stays shared at the top level. The session-start hook detects the legacy layout and warns — reorg is manual, not automated.
3. Tasks: existing tasks without a `package` field keep working (fallback to repo scope). New tasks: `uvx trellis-runtime task create <title> --package <pkg>` (validated against config.yaml `packages`).

## CLI reference

```bash
trellis-runtime — CLI Reference
================================

顶层入口：trellis-runtime <command> [args...]
（等价于 uvx --from trellis-runtime trellis-<command> ...；各 trellis-* 入口点仍单独安装）

可用 commands：
  task | get-context | add-session | get-developer | init-developer

全局：
  -h, --help     显示帮助；无参数时同样输出 usage
  未知命令       退出码 2，stderr 输出命令列表

─────────────────────────────────────────────────────────────────
1. trellis-runtime task   （任务管理，src: upstream/entry/task.py）
─────────────────────────────────────────────────────────────────
用法：trellis-runtime task <subcommand> [options]

Subcommands & 参数：

  create <title>
    title                    任务标题（必填，位置参数）
    --slug, -s <name>        任务 slug（不含 MM-DD 日期前缀）
    --assignee, -a <dev>     指派开发者
    --priority, -p <P0-P3>   优先级，默认 P2
    --description, -d <text> 任务描述
    --parent <dir>           父任务目录（建立 subtask 关联）
    --package <pkg>          monorepo 下的包名（会与 config.yaml packages 校验）

  add-context <dir> <file> <path> [reason]
    dir                      任务目录
    file                     JSONL 文件名，仅 implement | check
    path                     要添加的文件路径
    reason（可选）            添加原因

  validate <dir>
    dir                      校验该任务目录下的 jsonl 文件

  list-context <dir>
    dir                      列出该任务目录的 jsonl 条目

  start <dir>
    dir                      任务目录（支持任务名 / 相对路径 / 绝对路径）；设为活跃任务

  current
    --source                 额外显示活跃任务的判定来源

  finish                    清除活跃任务（无参数）

  set-branch <dir> <branch>
    dir / branch             为任务记录 git 工作分支

  set-base-branch <dir> <branch>
    dir / branch             设置 PR 目标（base）分支

  set-scope <dir> <scope>
    dir / scope              设置 PR 标题的 scope

  archive <name>
    name                     任务目录或任务名
    --no-commit              归档后跳过自动 git commit

  list
    --mine, -m               只显示当前开发者的任务
    --status, -s <status>    按状态过滤：planning | in_progress | review | completed

  list-archive [month]
    month（可选）             月份，格式 YYYY-MM；省略则列出全部归档

  add-subtask <parent_dir> <child_dir>
    将已有 child 任务链接到 parent

  remove-subtask <parent_dir> <child_dir>
    解除 child 与 parent 的关联

注意：`task init-context` 已在 v0.5.0-beta.12 移除，调用会直接报错（退出码 2）。

─────────────────────────────────────────────────────────────────
2. trellis-runtime get-context   （src: upstream/entry/get_context.py → common/git_context.py）
─────────────────────────────────────────────────────────────────
用法：trellis-runtime get-context [options]

  --json, -j                以 JSON 输出（可搭配任意 --mode）
  --mode, -m <mode>         输出模式（默认 default）：
                              default   完整上下文
                              record    record-session 用
                              packages  仅包信息
                              phase     提取 workflow 步骤内容
  --step <id>               配合 --mode phase：步骤 id，如 1.1、2.2；
                            省略则输出 Phase Index；未找到时退出码 2
  --platform <name>         配合 --mode phase：平台名（如 cursor、claude-code），
                            过滤带平台标签的块

─────────────────────────────────────────────────────────────────
3. trellis-runtime add-session   （src: upstream/entry/add_session.py）
─────────────────────────────────────────────────────────────────
用法：trellis-runtime add-session [options]

  --title <text>            会话标题（必填）
  --commit <hashes>         逗号分隔的 commit 哈希，默认 "-"
  --summary <text>          简短摘要，默认 "Session summary was not supplied."
  --content-file <path>     详细内容所在文件路径
  --package <pkg>           包名标签（如 cli、docs-site）
  --branch <name>           分支名；省略时按顺序解析：
                            ① CLI 参数 → ② 活跃任务 task.json 的 branch
                            → ③ git branch --show-current → ④ 省略
  --no-commit               不执行自动 git commit
  --stdin                   从 stdin 读取详细会话内容（需显式开启）

─────────────────────────────────────────────────────────────────
4. trellis-runtime get-developer   （src: upstream/entry/get_developer.py）
─────────────────────────────────────────────────────────────────
用法：trellis-runtime get-developer

无参数。stdout 输出当前开发者名；未初始化时输出
"Developer not initialized" 到 stderr 并退出码 1。

─────────────────────────────────────────────────────────────────
5. trellis-runtime init-developer   （src: upstream/entry/init_developer.py）
─────────────────────────────────────────────────────────────────
用法：trellis-runtime init-developer <developer-name>

  developer-name            开发者名（必填，位置参数）

行为：创建 .trellis/.developer 及 .trellis/workspace/<name>/ 目录结构；
      若已初始化则提示并退出码 0；缺参数时打印 usage 并退出码 1。
```
