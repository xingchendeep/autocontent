# Project Rules

- Always read PRD.md, TDD.md, TASKS.md, schema.sql, and API_SPEC.md before implementing.
- Only implement tasks explicitly assigned for the current iteration.
- Never implement more than 2 tasks at once.
- Do not expand scope beyond TASKS.md.
- Follow schema.sql for database design.
- Follow API_SPEC.md for request/response shapes and error codes.
- Stop after finishing the assigned tasks and report changed files, validation results, and TODOs.
# Package manager
- This project uses pnpm only.
- Never use npm commands.
- Use:
  - `pnpm install`
  - `pnpm add <pkg>`
  - `pnpm dev`
  - `pnpm lint`
  - `pnpm build`