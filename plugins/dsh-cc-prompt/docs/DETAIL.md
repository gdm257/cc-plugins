# Claude Code core prompt

## 来源

以用户抓包的 Claude Code 请求中的 system prompt 为底本，提取其核心行为指引，作为 DSH 的一个全局 system prompt section 注入。

## 注入方式

- 挂载一个 Host 层插件行 `cc-prompt`，调用 `ctx.systemPrompt.section()` 注册名为 `cc-prompt:core` 的 section，`order: 100`。
- 排列位置：persona prefix（order 0）之后、plan policy（order 500）与各工具指引 section（order 900+）之前。
- 全局注册，因此 standard / ptc / minimal / cordis 等 preset 及其 subagent 都会带上；DSH 原有的操作性 section（plan mode、工具指引、structured output、MCP 列表等）全部保留，不受影响。

## 对底本的适配

删除（与 DSH 无关或每次会话变化的部分）：

- Claude Fable 5 / Mythos 5 模型身份与营销段落。
- `# Environment` 中 Claude 模型族、Claude Code 发行渠道等事实。
- `<total_tokens>` 会话动态余量。

改写：

- 「displayed … in a terminal」去掉终端限定（DSH 为 Web GUI）。
- `/skill-name` 指引改为通过 DSH 的 `skill` tool 调用。

新增（取自同一抓包的 Environment 块，属静态安全规则）：

- 下载文件与解压归档按 untrusted data 处理的完整规则。

## 调整

- 改提示词内容：编辑本包 `prompt.md` 后重启 Harness 生效。
- 停用：在 Plugins 中禁用 `cc-prompt` 行或移除本 bundle。
