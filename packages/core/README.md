# @devory/core

Shared types, parsing utilities, and path configuration for [Devory](https://devory.ai).

## Installation

```bash
npm install @devory/core
```

## API

### Task parsing

```ts
import { parseFrontmatter } from '@devory/core'

const result = parseFrontmatter(fileContent)
// result.meta — typed TaskMeta fields
// result.body — markdown body after frontmatter
```

### Factory environment

```ts
import { resolveFactoryEnvironment, factoryPaths } from '@devory/core'

const env = resolveFactoryEnvironment()
const paths = factoryPaths(env.root)
// paths.tasksDir, paths.runsDir, paths.artifactsDir, etc.
```

## Types

- `TaskMeta` — frontmatter fields for a Devory task file
- `FactoryEnvironment` — resolved root, mode, and source
- `FactoryPaths` — all well-known directories in a factory workspace

## Requirements

- Node.js 18+
