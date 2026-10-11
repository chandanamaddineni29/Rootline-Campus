# Contributing

## Local setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm start` and open `http://localhost:3000`.
4. Run `npm run check` before committing.

## Working agreements

- Use focused branches such as `feature/student-profiles` or `fix/csv-validation`.
- Keep commits small and describe the user-visible change.
- Preserve accessible labels, keyboard behavior, and responsive layouts.
- Do not commit `.env` files, local databases, real student information, or credentials.
- Do not describe the rule-based indicators as validated predictions.
- Include manual verification steps in the pull request when automated browser tests are not available.

## Pull request checklist

- [ ] `npm run check` passes.
- [ ] Relevant workflows were tested manually.
- [ ] Import/export behavior and missing-data handling were reviewed if affected.
- [ ] Documentation was updated for new setup or configuration steps.
- [ ] No private student data, secrets, or generated database files are included.
