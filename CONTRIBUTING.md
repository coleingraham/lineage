# Contributing to Lineage

## Branch Naming

Use the following convention:

```
type/description
```

Examples:

- `feat/add-auth`
- `fix/query-bug`
- `chore/update-deps`
- `docs/api-reference`

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

feat(core): add entity model
fix(adapter-sqlite): handle null values
chore(ci): update Node.js version
docs(readme): add setup instructions
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear, atomic commits
3. Ensure CI passes (typecheck, lint, test, build)
4. Open a PR against `main`
5. Request review
6. Squash merge when approved
