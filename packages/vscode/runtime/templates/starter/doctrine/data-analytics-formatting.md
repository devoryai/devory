# BMG DAR Data Analytics Formatting Standards

## Purpose

This document defines the BMG Data Analytics & Reporting (DAR) team's code
formatting, linting, and documentation standards for SQL, Python, Notebooks,
and LookML.

These rules apply to all work performed in BMG analytics repositories (primarily
`rights-royalties-analytics` and `dbt`). They supplement global engineering
doctrine; where conflicts exist, these team-specific standards take precedence
for analytics work.

---

## Tooling (required)

| Tool | Version | Coverage |
|---|---|---|
| **SQLFluff** | 3.0.5 | All `.sql` files |
| **Black** | 26.3.0 | All `.py` and `.ipynb` files |

Always install `black[jupyter]` so notebooks are also linted.

Use the shared linting environment found in `rights-royalties-analytics/utils/env/linting`.

```bash
# conda (preferred)
conda env create -f environment.yml
conda activate linting

# pip fallback
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

**Important:** Keep the linting environment isolated. Do not install other
packages into it.

---

## SQL Standards

### Required rules

- All SQL **keywords must be lowercase** (`select`, `from`, `where`, `inner join`, etc.)
- All **functions must be lowercase** (`sum()`, `avg()`, `count()`, etc.)
- All other code must be **lowercase and snake_case**
- Table aliases must:
  - be more than one character in length
  - always use `as` before the alias (`from my_table as t1`)
- **JOINs must be explicit** — use `inner join`, `left outer join`, etc., never bare `join`
- Columns in the select clause must be aliased with `as` when more than one
  table is used in the query
- Subqueries that are not correlated must be **wrapped in a CTE** (`with` clause)
- **No more than one level of nesting** inside a subquery — if deeper logic is
  needed, use a `with` clause
- CTE aliases must be **descriptive** (e.g., `with income_generated_data as ()`
  not `with subquery_1 as ()`)
- Add comments to explain complex logic; do not comment trivially simple lines
- If a line causes a SQLFluff parsing error that cannot be resolved, add `--noqa`
  to that line so the pipeline does not fail

### SQLFluff workflow

```bash
# lint a folder
sqlfluff lint <path-to-folder>

# lint a single file
sqlfluff lint <path-to-file>

# auto-fix a folder
sqlfluff fix <path-to-folder>

# auto-fix a single file
sqlfluff fix <path-to-file>

# check parse errors
sqlfluff parse <path-to-file-or-folder>

# check only newly changed lines (run before opening a PR)
git add <changed-files>
diff-quality --violations sqlfluff
```

A score under 100% on `diff-quality` will fail the pipeline build.

---

## Python Standards

### Required

- `import` statements must always be at the **top of the file**
- Every **function and class must have a docstring** describing what it does
- Use **Sphinx-style docstrings**
- Comment complex logic for future readers (do not over-comment trivial code)

### Recommended (not required)

- Prefer `logging` over `print()` for code-flow visibility
- Break large scripts into **modules** for readability and reuse
- Wrap executable logic in **functions or classes** so the script can be imported
  without side effects
- Use an `if __name__ == "__main__":` block so the script can both be imported
  and run standalone
- Configure logging in the `__main__` block, not at module level

### Black workflow

```bash
# format all .py files in a folder
black <path-to-folder>

# format a single file
black <filename.py>
```

Black formats `.ipynb` files only when installed as `black[jupyter]`.

### Clean Python example

```python
import os
import logging

import pandas as pd
import pandas_gbq

logger = logging.getLogger(__name__)


def main():
    """Join CSV files into a single DataFrame and upload to BigQuery."""

    logger.info("Joining CSV files to single DataFrame")
    filepaths = [f for f in os.listdir(".") if f.endswith(".csv")]
    df = pd.concat(map(pd.read_csv, filepaths))

    logger.info("Uploading data to BigQuery table")
    pandas_gbq.to_gbq(
        df,
        "project.dataset.table_name",
        project_id="bmg-bigquery-prod",
        if_exists="append",
    )
    logger.info("Data successfully uploaded to BigQuery")


if __name__ == "__main__":
    logging.basicConfig(
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        level=logging.INFO,
    )
    main()
    logger.info("Script complete. Please check BigQuery for newly created table")
```

---

## Notebook Files (.ipynb)

The same SQL and Python formatting rules above apply to code cells in notebooks.

Additionally:
- Include **markdown cells** to explain what the notebook is doing at each section

---

## LookML

Follow the standards in the LookML repository README:
`looker/README.md`

---

## Git branch and commit message conventions

These rules extend `doctrine/git-workflow-standard.md` for
`rights-royalties-analytics` and `dbt`, where they are enforced via githooks.

**Branch name format:**
```
<type>/<ticket>
# example: feature/BMGDAR-4565
# allowed types: feature | bugfix | improvement | refactor | hotfix
```

**Commit message format:**
```
<type>(<ticket>)[!]?: <description>
# example: feature(BMGDAR-4565): add sacm return claim prefill logic
# allowed types: build | ci | docs | feature | fix | performance | refactor | revert | style | test
# ticket in commit must match ticket in branch name
```

To enable githooks in a configured repo:
```bash
git config --local core.hooksPath .githooks
```

---

## BigQuery cost controls

These rules must be followed on all BigQuery work to avoid high slot-hour usage
and unexpected charges.

- Always run with `--dry-run` first when a dry-run option is available
- Use **partition filters** wherever the target table is partitioned
- **Select only the columns needed** — avoid `SELECT *` on large tables
- Apply **writer/work/date filters early** in the query to reduce bytes scanned
- For development and testing, sample data using `WHERE RAND() < 0.1`
- Validate query logic on **synthetic or sampled data** before running at scale
- Use `INFORMATION_SCHEMA` or `EXPLAIN` to estimate bytes scanned before executing
- Refactor any query that previously triggered high-cost email alerts (e.g.,
  ~52 slot-hours / ~€8 per run) before re-running it
