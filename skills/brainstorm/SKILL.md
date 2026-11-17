---
name: brainstorm
description: Generate a wide pool of options, drop the obvious ones, rank what is left, then go deep on the few the user picks. Use for product and feature ideas, naming, and technical approaches — when the user says "побрейнштормим", "накидай идей/вариантов", "какие есть подходы", "придумай название", or asks for options where several paths are viable.
---

# Brainstorm

One cycle: **pool → pick → depth**. Repeat only if the user asks, or if their pick opens a new question.

## Before the pool

Facts are yours, decisions are the user's — but look, do not research. At most one quick check (a file, a directory, one command) when a number or a constraint would change the ranking. Otherwise go straight to the pool and state the assumption inline: "предполагаю X — поправь". A brainstorm that opens with five tool calls is a survey, not a brainstorm.

Do not open with a questionnaire — this is not `grilling`. Ask at most one question beforehand, and only when the goal itself is ambiguous: what this is for, and who uses it.

If the user has already decided and wants agreement, say that outright instead of staging a pool.

## The pool

12–18 ideas that differ in **strategy**, not in adjective:

- remove the problem instead of solving it
- invert the current design
- 10x the scale, or shrink it to one user
- make it free, or make it expensive
- steal the mechanism from another domain (games, editors, logistics, hardware)
- do nothing and see what breaks first

Every idea gets one line: what it is, and **what it costs** — effort, a constraint it breaks, a user it excludes. An idea with no downside is filler; drop it.

No near-duplicates: if two ideas differ only in wording, keep the sharper one. No praising adjectives (`seamless`, `robust`, `scalable`, `modern`) without a mechanism behind them.

Name the 1–2 **obvious** ideas you are deliberately not proposing, and why they lose. It proves the pool is not the first thing that came to mind.

## Ranking

The first reply to the user carries the pool, the ranking and the pick — not a progress report.

Order by fit to the stated goal, cost to try, reversibility, distinctness. Then print:

- the top 3, a short paragraph each
- the rest, one line each, grouped by the strategy axis they came from

## Pick

Ask through `ask_user_question`: `multiSelect: true`, the 3–4 most *different* candidates as options — not the 3 highest-ranked, keep the range wide — with a `description` naming the trade-off. The pool already sits in prose above; the question only picks where to dig.

## Depth

For each picked idea:

1. **What it is** — one sentence a stranger understands.
2. **Why it beats the alternative** — against the current state and against the runner-up.
3. **What it costs** — effort, migration, a promise you now have to keep.
4. **First step** — the smallest thing that proves it works this week.
5. **Killer risk** — what makes it fail, and the early signal you would notice.

Do not re-list the pool. Do not introduce new ideas in the depth round unless the user asks.

## Naming

For names, give 8–12 per family: plain, metaphorical, invented word. Each name comes with how it is pronounced in Russian, the image it evokes, and the two-word tagline it supports. Reject anything a person has to spell out loud to be understood. Flag the obvious collisions in the user's domain, and say plainly when the best name is already taken.

## Done

The cycle ends when the user picks one and can state what happens next. If two rounds produce no new strategy axis, say the space is closing instead of padding the list.
