# Changesets

This repository uses Changesets to manage versioning and npm releases.

Typical flow:

1. Create a branch such as `feat/runtime-env`.
2. Make your changes.
3. Add a changeset with `npm run changeset` for any user-facing change.
4. Open a pull request.
5. After merge, version and publish using the release flow for the repository.

Documentation-only, CI-only, or internal maintenance changes can usually skip a changeset.
