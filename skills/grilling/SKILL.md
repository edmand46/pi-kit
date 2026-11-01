---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round, then wait for the user's answers before the next round.

## Always ask through the form

Every question goes through the `ask_user_question` tool. Never write questions
as plain text in your response and never ask the user to type answers into chat.
That tool is the only interview channel this skill uses.

Rules for each call:

- Give every question a `header` (≤12 chars) naming the decision, and a full
  question body ending in a question mark.
- Put your recommended answer first in `options` and append `(Recommended)` to
  its label. Every option needs a `description` spelling out the trade-off.
- Use 2-4 options per question. The tool always offers a free-text
  "Type something." row, so never add an escape-hatch option yourself.
- Set `multiSelect: true` when the choices are not mutually exclusive.
- Use `preview` when the options are concrete artifacts worth comparing side by
  side (layouts, snippets, schemas, config). Skip it for plain preference calls.

A single call takes at most 4 questions. If the frontier is wider than that,
issue back-to-back `ask_user_question` calls until the round is covered — do not
drop questions, and do not spill the overflow into prose.

## Rounds

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
