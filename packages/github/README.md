# @devory/github

GitHub integration utilities for [Devory](https://devory.ai) — branch naming, PR metadata, and GitHub Actions helpers.

## Installation

```bash
npm install @devory/github
```

## API

### Branch helpers

```ts
import { buildBranchName, branchPrefix, slugify } from '@devory/github'

const { branch } = buildBranchName(task)
// e.g. "feat/task-042-add-login-page"
```

### PR helpers

```ts
import { buildPrMetadata } from '@devory/github'

const { title, body } = buildPrMetadata(task)
```

### GitHub Actions helpers

```ts
import { setOutput, setEnv, appendStepSummary, isGitHubActions } from '@devory/github'

if (isGitHubActions()) {
  setOutput('branch', branch)
  appendStepSummary('## Run complete')
}
```

### PR creation

```ts
import { createPr } from '@devory/github'

// Requires GITHUB_TOKEN in environment
const result = await createPr({ task, branch, base: 'main', confirm: true })
```

## Requirements

- Node.js 18+
- `GITHUB_TOKEN` env var for PR creation commands
- A Devory factory workspace — sign up at [devory.ai](https://devory.ai)
