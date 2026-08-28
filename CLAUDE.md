# NestBook — Claude working instructions

## Working notes for multi-step features

For any feature that will span more than one session or more than one prompt:

1. At the START of work, check whether `docs/in-progress/<feature-slug>.md` already exists.
   If it does, READ IT FIRST before investigating or opening any files —
   it already contains confirmed facts from earlier work on this feature.

2. If it doesn't exist, create it after your first investigation pass. Include:
   - Confirmed schema/file facts (so they're never re-checked)
   - Decisions made and why
   - Files touched so far
   - Remaining steps / what's next
   - Anything explicitly ruled out (so it isn't re-suggested)

3. UPDATE this file before ending every session on this feature —
   even if the feature isn't finished. Treat it as handing off to
   a colleague who has zero memory of this conversation.

4. When the feature ships and is verified working, DELETE the file
   (or move it to `docs/completed/` if John wants a record) —
   don't let stale in-progress notes accumulate.

5. This is separate from AUDIT_MASTER_LIST.md, which tracks the
   ongoing audit backlog, not individual feature builds.

## Every session, every prompt

Always commit and push to `main` when done. If working on a branch
(Desktop's worktree feature auto-creates one per session), explicitly
state which branch was used and that it still needs merging to main
before it reaches production. Never assume "committed" means "on main."
