# Contributing

## Branches

Use one of these branch prefixes:

- `feat/<short-name>`
- `fix/<short-name>`
- `chore/<short-name>`
- `docs/<short-name>`
- `refactor/<short-name>`
- `test/<short-name>`
- `ci/<short-name>`
- `release/<short-name>`

`main` is protected and should only move through pull requests.

## Commits

This repo uses Conventional Commits.

Examples:

- `feat(cli): add env-file support`
- `fix(adapter): preserve runtime env precedence`
- `docs(readme): clarify deploy flow`

Supported types:

- `feat`
- `fix`
- `docs`
- `refactor`
- `test`
- `chore`
- `ci`
- `build`
- `perf`
- `revert`

## Local checks

The repo uses Husky hooks:

- `pre-commit`: branch name check + `lint-staged`
- `commit-msg`: `commitlint`
- `pre-push`: full test suite

You can also run the checks manually:

```bash
npm run lint
npm run build
npm test
```

## Changesets

For user-facing changes, add a changeset:

```bash
npm run changeset
```

Documentation-only, CI-only, or internal maintenance changes can skip it when no release note is needed.

## Recommended GitHub branch protection

Configure `main` with:

- require pull request before merging
- require branches to be up to date
- require status checks to pass
- require at least one approval
- restrict direct pushes if desired
