---
name: skills-next
description: This skill should be used when the user asks to "use skills", "skills-next", "check available skills", "load skills", "what skills are available", or wants to ensure all relevant skills are considered for the next task.
version: 1.0.0
---

# Skills-Next: Enhanced Skill Discovery

## Purpose

Force explicit consideration of all available skills before processing the next user input. This skill addresses the issue where LLMs may overlook or ignore available skills that would be helpful for completing a task.

## When to Use

Load this skill when:
- User explicitly requests skill usage ("use skills", "skills-next")
- User wants to verify what skills are available for a task
- Complex tasks might benefit from multiple skills
- Previous attempts may have missed relevant skills

## Workflow

After reading this skill, modify behavior for the NEXT user input only:

### Step 1: Analyze the User Input

Read and analyze the incoming user prompt. Identify:
- The core task or goal
- Domain-specific requirements
- Potential technical areas involved
- Workflow patterns implied

### Step 2: Identify Relevant Skills

Review available skills and list all skills that could be helpful. For each skill:
- Read the skill's frontmatter (name + description)
- Determine if the skill applies to the current task
- Note any interdependencies between skills

**Criteria for relevance:**
- Skill description mentions key terms from the user input
- Skill provides workflows for the task domain
- Skill offers tools or resources needed for completion
- Skill addresses specific constraints or requirements

### Step 3: Load Identified Skills

Use the `skill` tool to load each identified skill content. Execute these skill tool calls in sequence:
```
skill: load skill-name-1
skill: load skill-name-2
...
```

**Important:** Load skills ONLY. Do not execute any other tools or begin task processing until all relevant skills are loaded.

### Step 4: Process User Input

After loading all relevant skills, process the user input following the loaded skills' instructions:
- Follow skills' instructions in suitable order
- Apply skills' workflows and guidelines
- Use skills' provided tools and resources
- Coordinate multiple skills if loaded

### Step 5: Handle No-Skills Case

If no relevant skills are identified:
- State that no applicable skills were found
- Proceed with normal task processing
- Use standard tools and reasoning

## Important Notes

### One-Time Effect

This skill affects ONLY the next user input. After processing that input, return to normal behavior. The user must request "skills-next" again for subsequent tasks.

### Skill Loading Order

When multiple skills are relevant, consider the order:
1. Load foundational skills first (structure, patterns)
2. Load domain-specific skills next
3. Load utility or helper skills last

### Skill Conflicts

If loaded skills provide conflicting guidance:
- Prefer domain-specific over general-purpose skills
- Prefer more recent or versioned skills
- Explicitly state the conflict resolution approach
- Follow the most specific guidance applicable to the task

### Metadata-Only Skills

Some skills may be useful based on metadata alone without loading full content. If a skill's description clearly indicates relevance but detailed content isn't needed:
- Note the skill is considered
- Mention why full content wasn't loaded
- Proceed with task processing

## Example Scenario

**User request:** "skills-next" (loaded)

**Next user input:** "Create a new agent for processing customer support tickets"

**Skills-next workflow:**
1. Analyze: Task is creating an agent for a specific domain (customer support)
2. Identify relevant skills:
   - `agent-development` - for agent creation guidance
   - `plugin-structure` - for where to place the agent
3. Load skills:
   - `skill: agent-development`
   - `skill: plugin-structure`
4. Process user input using both skills' instructions

## Troubleshooting

**Issue:** Skills don't load or aren't found
- Verify skill names match available skills
- Check skill directory structure is correct
- Ensure SKILL.md has valid frontmatter

**Issue:** Too many skills loaded
- Prioritize by direct relevance to the task
- Consider if general-purpose skills add value
- Focus on skills that address specific requirements

**Issue:** Conflicting instructions from multiple skills
- Identify the conflict clearly
- Determine which skill's domain is more specific to the task
- State the resolution approach
- Document the decision for user transparency
