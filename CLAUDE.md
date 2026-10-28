@AGENTS.md

## Claude Code notes

- `AGENTS.md` (imported above) holds the full project context and is shared with Codex. Put project facts there, not here, so both agents see the same thing. When a feature or release changes the project state, update its **Current state** and **Next** sections in the same commit.
- `mobile/CLAUDE.md` adds the Expo SDK rules when you work in `mobile/`.
- If usage is about to run out mid-task, hand the remaining work to Codex through T3 `delegate_task`, using `AGENTS.md` plus the relevant `docs/*.md` as the brief. Don't do this by default.
- Check UI in the browser preview (`npm run export:web`, or `npm start` then the web target). Use headless Playwright screenshots when the T3 preview tab isn't visible.

## Compact instructions

When compacting, write the summary so the next context window knows **what we are building first, then where we are**. `AGENTS.md` is reloaded after compaction, so don't copy it. Summarise only what this conversation added or changed, in this order:

1. **Goal.** One line: Sasta (see `AGENTS.md`) plus what this session is trying to achieve for the owner.
2. **The owner's requests.** Quote each request verbatim, newest last, and mark it done, in progress or not started. Include their corrections and preferences, with the reason when they gave one.
3. **Decisions.** What was chosen and why, including approaches that were tried and dropped, so they are not retried.
4. **Work state.**
   - Commits: SHA and one line each.
   - Uncommitted or changed files.
   - CI run IDs and their results.
   - What was verified and how: tests, screenshots, live checks.
   - Exact error messages that are still unresolved.
5. **Waiting on the owner.** Approvals (releases, outward-facing actions), logins, unanswered questions. An approval given earlier does not carry over.
6. **Live environment.**
   - Running dev servers.
   - Worktrees and branches.
   - Delegated task IDs.
   - Temp files that hold tokens or personal data, which need cleaning up. Give their paths, never their contents.
7. **Next step.** The exact command or edit, and whether it needs the owner's approval first.

Leave out tool output dumps and file contents already in git; reference the path and SHA instead. Never put tokens, cookies or the owner's personal data in the summary.
