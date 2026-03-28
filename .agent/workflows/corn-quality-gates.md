---
description: MANDATORY Corn Hub quality gates and MCP tool usage for EVERY task
---

# 🌽 Corn Hub — Mandatory Quality Gates

> **⛔ ZERO TOLERANCE POLICY: Skipping ANY step below is a FAILURE. Every single MCP tool MUST be called in every task. No exceptions. No shortcuts. No "I'll do it next time."**

This workflow is **COMPULSORY** for every single task. If you skip a step, the task is considered FAILED regardless of whether the code works.

---

## Phase 0: Session Start (BEFORE any work)

**ALL 5 calls below are REQUIRED before touching any code:**

// turbo-all

1. ✅ Call `corn_tool_stats` — Display live analytics in the chat
2. ✅ Call `corn_session_start` — Start a tracked session with project name + task summary
3. ✅ Call `corn_changes` — Check for recent code changes from other agents
4. ✅ Call `corn_memory_search` — Search memories related to the current task
5. ✅ Call `corn_knowledge_search` — Search knowledge base for existing patterns/decisions

**⛔ DO NOT PROCEED to Phase 1 until all 5 tools above have been called.**

---

## Phase 1: Planning (BEFORE any code changes)

**ALL 3 steps below are REQUIRED:**

6. ✅ Write the implementation plan
7. ✅ Call `corn_plan_quality` with the FULL plan text
   - **Score MUST be ≥80% to proceed**
   - If score < 80%: STOP. Revise the plan. Resubmit. Repeat until it passes.
   - If score ≥ 80%: Proceed.
8. ✅ Call `corn_memory_store` — Store the approved plan for future reference

**⛔ DO NOT WRITE ANY CODE until the plan scores ≥80%.**

---

## Phase 2: Execution

**ALL 3 code intelligence tools below MUST be called during execution:**

9. ✅ Call `corn_code_search` — Find related code patterns before making changes
10. ✅ Call `corn_code_read` — Read relevant source files from the index
11. ✅ Call `corn_detect_changes` — Assess risk of uncommitted changes
12. Execute the approved plan

**Additional code intelligence tools (call when applicable):**
- `corn_code_context` — Get 360° view of symbols you're modifying
- `corn_code_impact` — Check blast radius before editing critical symbols
- `corn_cypher` — Query the code knowledge graph for complex relationships
- `corn_list_repos` — List indexed repositories

---

## Phase 3: Quality Report (AFTER all work is done)

**REQUIRED — no exceptions:**

13. ✅ Call `corn_quality_report` with 4-dimension scoring:
    - `scoreBuild` (0-25): Does the code compile/build without errors?
    - `scoreRegression` (0-25): Were any existing features broken?
    - `scoreStandards` (0-25): Does the code follow project conventions?
    - `scoreTraceability` (0-25): Can changes be traced to the task?
    - **Total MUST be ≥80/100 to PASS**
    - If < 80: FIX the issues, then resubmit.

**⛔ DO NOT PROCEED to Phase 4 until the quality report passes.**

---

## Phase 4: Session End

**ALL 5 calls below are REQUIRED:**

14. ✅ Call `corn_knowledge_store` — Store any reusable patterns, decisions, or bug fixes discovered
15. ✅ Call `corn_memory_store` — Store a summary of what was accomplished
16. ✅ Call `corn_health` — Final system health check
17. ✅ Call `corn_session_end` — End the session with:
    - Summary of what was done
    - Files changed
    - Key decisions made
    - Any remaining blockers
18. ✅ Call `corn_tool_stats` — Display final analytics showing all tools were used

---

## Complete Tool Checklist (18/18 REQUIRED)

Every task must call ALL of these tools. Check them off as you go:

| # | Tool | Phase | Status |
|---|------|-------|--------|
| 1 | `corn_tool_stats` | 0, 4 | ⬜ |
| 2 | `corn_session_start` | 0 | ⬜ |
| 3 | `corn_changes` | 0 | ⬜ |
| 4 | `corn_memory_search` | 0 | ⬜ |
| 5 | `corn_knowledge_search` | 0 | ⬜ |
| 6 | `corn_plan_quality` | 1 | ⬜ |
| 7 | `corn_memory_store` | 1, 4 | ⬜ |
| 8 | `corn_code_search` | 2 | ⬜ |
| 9 | `corn_code_read` | 2 | ⬜ |
| 10 | `corn_code_context` | 2 | ⬜ |
| 11 | `corn_code_impact` | 2 | ⬜ |
| 12 | `corn_cypher` | 2 | ⬜ |
| 13 | `corn_list_repos` | 2 | ⬜ |
| 14 | `corn_detect_changes` | 2 | ⬜ |
| 15 | `corn_quality_report` | 3 | ⬜ |
| 16 | `corn_knowledge_store` | 4 | ⬜ |
| 17 | `corn_health` | 4 | ⬜ |
| 18 | `corn_session_end` | 4 | ⬜ |

---

## Hard Rules

1. **NEVER skip any tool.** Every tool in the checklist MUST be called at least once per task.
2. **NEVER execute a plan that scored below 80%** on `corn_plan_quality`.
3. **NEVER end a task without a passing `corn_quality_report`** (≥80/100).
4. **ALWAYS call `corn_tool_stats` at both the START and END** of every task.
5. **ALWAYS call `corn_health` before ending** to verify system integrity.
6. If a quality report scores below 80/100, you MUST fix the issues and resubmit before ending.
7. If any tool returns an error, document it and attempt a retry. Do NOT silently skip it.
