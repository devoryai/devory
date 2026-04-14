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
- `LicenseInfo` / `LicenseStatus` — resolved tier, source, verification, and cache state

## License Helpers

```ts
import { detectTier, getLicenseStatus, writeLicenseToken, clearLicenseToken } from '@devory/core'

const tier = await detectTier('/path/to/workspace')
const status = await getLicenseStatus('/path/to/workspace')
writeLicenseToken('/path/to/workspace', 'devory_pro_...')
clearLicenseToken('/path/to/workspace')
```

## Routing Control Plane

`@devory/core` exports the routing-control-plane helpers used by the VS Code run surface, including task profiling, routing policy resolution, provider registry selection, concrete target resolution, readiness checks, adapter resolution, and execution binding.

These helpers are deterministic and inspectable. They preserve selected-versus-actual truth rather than collapsing the route into one synthetic value.

## Requirements

- Node.js 18+
