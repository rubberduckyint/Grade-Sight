# Monorepo Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the hybrid JS + Python monorepo skeleton defined in `docs/superpowers/specs/2026-04-21-monorepo-scaffolding-design.md` — an installable, buildable, dev-runnable workspace with `apps/web`, `apps/api`, `packages/shared`, and `infra/` configured per the spec's acceptance criteria.

**Architecture:** pnpm workspaces + Turborepo manage the JS side; uv manages the Python side. A root `postinstall` hook wires both so `pnpm install` bootstraps everything. `concurrently` orchestrates `pnpm dev` to boot both apps in one terminal. No runtime integration between apps — they communicate over HTTP, and `packages/shared` is consumed by `apps/web` only (Python has its own Pydantic source of truth).

**Tech Stack:** Node 20+, pnpm 9+, Turborepo 2.x, TypeScript 5.6+, Next.js 15 (App Router) + Tailwind + shadcn/ui, Vitest, Python 3.12, uv 0.5+, FastAPI + Uvicorn, Pydantic 2 + pydantic-settings, Ruff, mypy strict, pytest + pytest-asyncio, ESLint 9 + Prettier 3.

**No tests written in this plan.** Spec 1 explicitly defers tests per the kickoff doc. Each task's verification is running the appropriate command and confirming expected output.

**Prerequisites before starting:**
- Node 20.x installed (check: `node --version` → `v20.x.x`)
- pnpm 9.x installed (check: `pnpm --version` → `9.x.x`). Install via `npm install -g pnpm@9` if missing.
- Python 3.12.x installed (check: `python3.12 --version` → `Python 3.12.x`)
- uv installed (check: `uv --version` → `uv 0.5.x` or higher). Install via `curl -LsSf https://astral.sh/uv/install.sh | sh` if missing.
- Git configured and working; repo at `/Users/exexporerporer/Projects/Grade-Sight` on branch `main`, clean working tree.

---

## Task 1: Root workspace config

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.nvmrc`, `.python-version`, `.editorconfig`, `.prettierrc`, `.prettierignore`
- Modify: `.gitignore` (extend)

- [ ] **Step 1: Write `.nvmrc`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/.nvmrc`

Content (exactly):
```
20
```

- [ ] **Step 2: Write `.python-version`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/.python-version`

Content (exactly):
```
3.12
```

- [ ] **Step 3: Write `.editorconfig`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/.editorconfig`

Content (exactly):
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.py]
indent_size = 4

[Makefile]
indent_style = tab
```

- [ ] **Step 4: Write `.prettierrc`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/.prettierrc`

Content (exactly):
```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

- [ ] **Step 5: Write `.prettierignore`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/.prettierignore`

Content (exactly):
```
# Build artifacts
.next
dist
build
coverage

# Deps
node_modules

# Python (handled by ruff)
apps/api

# Generated
pnpm-lock.yaml
uv.lock

# Turbo
.turbo
```

- [ ] **Step 6: Extend `.gitignore`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/.gitignore`

Append the following lines (do NOT remove existing content):

```
# Turborepo
.turbo/

# TypeScript incremental build cache
*.tsbuildinfo

# Next.js generated
next-env.d.ts
# (Note: next-env.d.ts IS typically committed in Next projects, but we have it .gitignored because
# we check it into the repo explicitly where needed; if Next complains, remove this line.)
```

Then run: `grep -c "^" /Users/exexporerporer/Projects/Grade-Sight/.gitignore`
Expected: a number > 30 (the original had ~35 entries; 3 new lines added).

Actually, remove the next-env.d.ts ignore (Next.js convention is to commit it, and removing this rule avoids the confusion in the comment). After review, the .gitignore additions should be only:

```
# Turborepo
.turbo/

# TypeScript incremental build cache
*.tsbuildinfo
```

Use the Edit tool to append those two sections to `.gitignore`.

- [ ] **Step 7: Write `tsconfig.base.json`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/tsconfig.base.json`

Content (exactly):
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 8: Write `pnpm-workspace.yaml`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/pnpm-workspace.yaml`

Content (exactly):
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 9: Write `turbo.json`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/turbo.json`

Content (exactly):
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "outputs": [],
      "dependsOn": ["^build"]
    },
    "format": {
      "outputs": []
    },
    "test": {
      "outputs": [],
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 10: Write root `package.json`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/package.json`

Content (exactly):
```json
{
  "name": "grade-sight",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  },
  "scripts": {
    "install:py": "uv sync --project apps/api",
    "postinstall": "pnpm install:py",
    "dev": "concurrently -n web,api -c blue,green \"pnpm --filter web dev\" \"cd apps/api && uv run uvicorn grade_sight_api.main:app --reload --port 8000\"",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "format": "turbo run format",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test"
  },
  "devDependencies": {
    "concurrently": "^9.1.0",
    "prettier": "^3.3.3",
    "turbo": "^2.3.0",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 11: Initial install (will partially fail — apps don't exist yet)**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm install --ignore-scripts`

The `--ignore-scripts` flag skips the `postinstall` (which would try to `uv sync` a non-existent `apps/api`). Expected: pnpm installs the four root devDeps (`concurrently`, `prettier`, `turbo`, `typescript`) and creates `node_modules/` + `pnpm-lock.yaml`.

- [ ] **Step 12: Verify turbo is reachable**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm turbo --version`
Expected: a version string like `2.3.x`, no errors.

- [ ] **Step 13: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add .
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add root workspace config for Grade-Sight monorepo

pnpm workspaces + Turborepo for JS orchestration, Node 20 and
Python 3.12 pins, strict TS base, Prettier + EditorConfig, extended
.gitignore for Turbo cache and tsbuildinfo. Root devDeps installed
with --ignore-scripts; postinstall will run once apps/api exists.

Per docs/superpowers/specs/2026-04-21-monorepo-scaffolding-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `packages/shared`

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`

- [ ] **Step 1: Create the directory**

Run: `mkdir -p /Users/exexporerporer/Projects/Grade-Sight/packages/shared/src`

- [ ] **Step 2: Write `packages/shared/package.json`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/packages/shared/package.json`

Content (exactly):
```json
{
  "name": "@grade-sight/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch --preserveWatchOutput",
    "typecheck": "tsc --noEmit",
    "lint": "echo 'no lint for shared (no runtime code)' && exit 0",
    "format": "prettier --write src",
    "test": "echo 'no tests yet' && exit 0"
  }
}
```

- [ ] **Step 3: Write `packages/shared/tsconfig.json`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/packages/shared/tsconfig.json`

Content (exactly):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 4: Write `packages/shared/src/index.ts`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/packages/shared/src/index.ts`

Content (exactly):
```typescript
// Day-one types for Grade-Sight.
// Each type mirrors a Pydantic class in apps/api; the Python side remains the
// source of truth for runtime validation. Update both when changing a shape.

// Mirrors OrganizationId (Pydantic) — see apps/api/src/grade_sight_api/models.py when created.
export type OrganizationId = string & { readonly __brand: "OrganizationId" };

// Mirrors StudentId (Pydantic).
export type StudentId = string & { readonly __brand: "StudentId" };

// Mirrors AssessmentId (Pydantic).
export type AssessmentId = string & { readonly __brand: "AssessmentId" };

// Mirrors UserRole enum (Pydantic).
export type UserRole = "parent" | "teacher" | "admin";

// Skeleton for the diagnostic record. Full shape lives in
// docs/PROJECT_BRIEF.md §Diagnostic Output Schema. Expanded in a later spec
// once the diagnostic engine work begins.
export interface DiagnosticRecord {
  assessment_id: AssessmentId;
  student_id: StudentId;
  graded_at: string; // ISO 8601
}
```

- [ ] **Step 5: Install and build**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm install --ignore-scripts`
Expected: pnpm recognizes the new workspace package `@grade-sight/shared`. No errors.

Run: `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter @grade-sight/shared build`
Expected: `tsc` succeeds, creates `packages/shared/dist/index.js`, `packages/shared/dist/index.d.ts`, and `.tsbuildinfo`.

- [ ] **Step 6: Verify build output**

Run: `ls /Users/exexporerporer/Projects/Grade-Sight/packages/shared/dist/`
Expected output includes `index.js`, `index.d.ts`, `index.js.map`, `index.d.ts.map`.

- [ ] **Step 7: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add packages/ pnpm-lock.yaml
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add packages/shared with day-one Grade-Sight types

TypeScript-only workspace package; apps/web consumes via workspace
protocol. Contains branded ID types (OrganizationId, StudentId,
AssessmentId), UserRole enum, and a DiagnosticRecord skeleton.
Each type mirrors a Pydantic class in apps/api (to be created).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `apps/web`

**Files:**
- Create: `apps/web/*` (scaffolded by create-next-app), then customized.

- [ ] **Step 1: Scaffold the Next.js app**

Run from the repo root:
```bash
cd /Users/exexporerporer/Projects/Grade-Sight && \
  pnpm create next-app@latest apps/web \
    --typescript \
    --tailwind \
    --app \
    --no-src-dir \
    --import-alias "@/*" \
    --use-pnpm \
    --eslint \
    --turbopack
```

Expected: Next.js scaffolds into `apps/web/`. A prompt may appear asking about packages not in the flag list; accept defaults. If scaffold prompts for "Would you like to use Turbopack for `next dev`?", answer yes.

**If the scaffold creates a `.git/` directory inside `apps/web/`**, delete it:
```bash
rm -rf /Users/exexporerporer/Projects/Grade-Sight/apps/web/.git
```

- [ ] **Step 2: Edit `apps/web/package.json` — set name and add workspace dep**

Read the current `apps/web/package.json`. Change `"name"` to `"web"` (from whatever create-next-app set). Under `"dependencies"`, add `"@grade-sight/shared": "workspace:*"`. Add these scripts under `"scripts"` (some may already exist — merge):

```json
{
  "scripts": {
    "dev": "next dev --turbopack --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "lint": "next lint",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "test": "echo 'no tests yet' && exit 0"
  }
}
```

Keep the existing `"dependencies"` (react, react-dom, next) and `"devDependencies"` (@types/*, typescript, tailwindcss, eslint, eslint-config-next, @eslint/eslintrc) that create-next-app added.

Add to `"devDependencies"`:
```json
{
  "@t3-oss/env-nextjs": "^0.11.1",
  "zod": "^3.23.8",
  "vitest": "^2.1.4",
  "@typescript-eslint/eslint-plugin": "^8.10.0",
  "@typescript-eslint/parser": "^8.10.0"
}
```

Use the Edit tool to surgically modify `apps/web/package.json`. Do not replace the whole file — preserve whatever create-next-app authored.

- [ ] **Step 3: Edit `apps/web/tsconfig.json` to extend the base**

Read the current `apps/web/tsconfig.json`. It will look similar to:
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    /* ...many next.js defaults... */
  },
  "include": [...],
  "exclude": ["node_modules"]
}
```

Add `"extends": "../../tsconfig.base.json"` as the first key, and add the following to `compilerOptions` (merge, don't replace):

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true
}
```

Keep the Next.js-required `jsx`, `plugins`, `paths`, `incremental` settings intact.

- [ ] **Step 4: Write `apps/web/env.ts`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/env.ts`

Content (exactly):
```typescript
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Server-only env vars go here. None required in Spec 1.
  },
  client: {
    NEXT_PUBLIC_API_URL: z.string().url(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  emptyStringAsUndefined: true,
});
```

- [ ] **Step 5: Replace `apps/web/app/page.tsx` with the placeholder landing**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/app/page.tsx`

Overwrite with:
```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">Grade-Sight</h1>
      <p className="mt-4 text-lg text-gray-600">Coming soon.</p>
    </main>
  );
}
```

- [ ] **Step 6: Write `apps/web/.env.example`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/.env.example`

Content (exactly):
```
# Required
NEXT_PUBLIC_API_URL=http://localhost:8000

# Future (uncomment when their spec lands):
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
# CLERK_SECRET_KEY=
# NEXT_PUBLIC_SENTRY_DSN=
```

- [ ] **Step 7: Create `apps/web/.env.local` for dev**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/.env.local`

Content (exactly):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

(This file is gitignored; needed so `pnpm build` and `pnpm dev` succeed without the user setting env vars first.)

- [ ] **Step 8: Write `apps/web/components.json` (shadcn/ui config)**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/components.json`

Content (exactly):
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

Note: this file exists for future `pnpm dlx shadcn@latest add <component>` invocations. No components are added in Spec 1.

- [ ] **Step 9: Write `apps/web/lib/utils.ts` (shadcn expects this)**

Run first: `mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/web/lib`

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/lib/utils.ts`

Content (exactly):
```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

Then install the two deps:
```bash
cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter web add clsx tailwind-merge
```

- [ ] **Step 10: Write `apps/web/railway.json`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/railway.json`

Content (exactly):
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install --frozen-lockfile && pnpm --filter web... build"
  },
  "deploy": {
    "startCommand": "pnpm --filter web start",
    "healthcheckPath": "/",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

- [ ] **Step 11: Write `apps/web/vitest.config.ts`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/web/vitest.config.ts`

Content (exactly):
```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 12: Install jsdom and react-testing deps for Vitest harness**

Run:
```bash
cd /Users/exexporerporer/Projects/Grade-Sight && \
  pnpm --filter web add -D jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 13: Install workspace deps**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm install --ignore-scripts`

Expected: all new deps resolved, `@grade-sight/shared` linked into `apps/web/node_modules` as a workspace symlink.

- [ ] **Step 14: Verify `apps/web` builds**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter web build`

Expected: Next.js build completes with no errors; output shows a static page for `/`. If the build fails with a missing env var, confirm `apps/web/.env.local` exists with `NEXT_PUBLIC_API_URL` set.

- [ ] **Step 15: Verify `apps/web` typechecks**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter web typecheck`

Expected: `tsc --noEmit` exits 0 with no output.

- [ ] **Step 16: Verify `apps/web` lints**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm --filter web lint`

Expected: `next lint` reports no errors. Warnings are acceptable; errors are not.

- [ ] **Step 17: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/web pnpm-lock.yaml package.json
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add apps/web — Next.js 15 + Tailwind + shadcn config

Scaffolded via create-next-app, customized with strict tsconfig
extending the workspace base, typed env validation via
@t3-oss/env-nextjs, Vitest harness, shadcn components.json for
future CLI adds, Railway service config, and a placeholder landing
page. @grade-sight/shared wired as a workspace dep.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `apps/api`

**Files:**
- Create: `apps/api/pyproject.toml`, `apps/api/uv.lock` (auto-generated), `apps/api/src/grade_sight_api/{__init__.py, main.py, config.py, services/__init__.py}`, `apps/api/tests/{__init__.py, conftest.py}`, `apps/api/.env.example`, `apps/api/railway.json`, `apps/api/package.json`

- [ ] **Step 1: Create the directory structure**

Run:
```bash
mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/services
mkdir -p /Users/exexporerporer/Projects/Grade-Sight/apps/api/tests
```

- [ ] **Step 2: Write `apps/api/pyproject.toml`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/pyproject.toml`

Content (exactly):
```toml
[project]
name = "grade-sight-api"
version = "0.0.0"
description = "Grade-Sight API — diagnostic grading platform backend"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "pydantic>=2.9.0",
    "pydantic-settings>=2.5.0",
]

[dependency-groups]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "httpx>=0.27.0",
    "ruff>=0.7.0",
    "mypy>=1.11.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/grade_sight_api"]

[tool.ruff]
line-length = 100
target-version = "py312"
src = ["src", "tests"]

[tool.ruff.lint]
select = [
    "E",   # pycodestyle errors
    "W",   # pycodestyle warnings
    "F",   # pyflakes
    "I",   # isort
    "B",   # flake8-bugbear
    "UP",  # pyupgrade
    "SIM", # flake8-simplify
    "RUF", # ruff-specific
]

[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true

[[tool.mypy.overrides]]
module = "tests.*"
disallow_untyped_defs = false

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 3: Write `apps/api/src/grade_sight_api/__init__.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/__init__.py`

Content (exactly):
```python
"""Grade-Sight API package."""

__version__ = "0.0.0"
```

- [ ] **Step 4: Write `apps/api/src/grade_sight_api/config.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/config.py`

Content (exactly):
```python
"""Typed settings loaded from environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the Grade-Sight API."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    api_port: int = 8000
    cors_origin: str = "http://localhost:3000"
    log_level: str = "info"
    environment: str = "development"


settings = Settings()
```

- [ ] **Step 5: Write `apps/api/src/grade_sight_api/main.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/main.py`

Content (exactly):
```python
"""FastAPI application entry point."""

from fastapi import FastAPI

from .config import settings

app = FastAPI(title="Grade-Sight API", version="0.0.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    """Health check — returns OK unconditionally in Spec 1."""
    return {"status": "ok", "environment": settings.environment}
```

- [ ] **Step 6: Write `apps/api/src/grade_sight_api/services/__init__.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/src/grade_sight_api/services/__init__.py`

Content (exactly):
```python
"""External service abstraction layer.

Empty in Spec 1. Populated in Spec 4 with Claude, S3, and audit-log wiring.
"""
```

- [ ] **Step 7: Write `apps/api/tests/__init__.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/tests/__init__.py`

Content: empty file (create with `touch` or write empty string).

- [ ] **Step 8: Write `apps/api/tests/conftest.py`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/tests/conftest.py`

Content (exactly):
```python
"""Pytest skeleton for the Grade-Sight API test suite.

No tests defined yet — scaffolding only per Spec 1.
"""
```

- [ ] **Step 9: Write `apps/api/.env.example`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/.env.example`

Content (exactly):
```
# Required
API_PORT=8000
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
ENVIRONMENT=development

# Future (uncomment when their spec lands):
# DATABASE_URL=
# CLERK_JWKS_URL=
# ANTHROPIC_API_KEY=
# SENTRY_DSN=
# RESEND_API_KEY=
# AWS_S3_BUCKET=
```

- [ ] **Step 10: Write `apps/api/.env` for dev**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/.env`

Content (exactly):
```
API_PORT=8000
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
ENVIRONMENT=development
```

(Gitignored; needed so local dev runs without manual env setup.)

- [ ] **Step 11: Write `apps/api/railway.json`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/railway.json`

Content (exactly):
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "uv run uvicorn grade_sight_api.main:app --host 0.0.0.0 --port $PORT",
    "healthcheckPath": "/api/health",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

- [ ] **Step 12: Write `apps/api/package.json` (so pnpm recognizes the workspace member)**

pnpm's `pnpm-workspace.yaml` globs `apps/*`, so `apps/api` needs a `package.json` for pnpm to include it (otherwise pnpm will try to install it as a package and fail). We give it a minimal one that doesn't conflict with uv.

Path: `/Users/exexporerporer/Projects/Grade-Sight/apps/api/package.json`

Content (exactly):
```json
{
  "name": "api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "uv run uvicorn grade_sight_api.main:app --reload --port 8000",
    "build": "uv build",
    "start": "uv run uvicorn grade_sight_api.main:app --host 0.0.0.0 --port ${PORT:-8000}",
    "lint": "uv run ruff check",
    "format": "uv run ruff format",
    "typecheck": "uv run mypy src",
    "test": "uv run pytest"
  }
}
```

This lets Turborepo treat `apps/api` as a workspace member for task orchestration, while uv remains the authoritative Python tool inside.

- [ ] **Step 13: Run uv sync**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv sync`

Expected: uv creates `.venv/`, installs all deps from `pyproject.toml`, generates `uv.lock`. No errors.

- [ ] **Step 14: Verify the app imports and app.title works**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run python -c "from grade_sight_api.main import app; print(app.title, app.version)"`

Expected output (exactly, or very close):
```
Grade-Sight API 0.0.0
```

- [ ] **Step 15: Verify the health endpoint over HTTP**

Run in one terminal (blocking):
```bash
cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run uvicorn grade_sight_api.main:app --port 8001 &
UVICORN_PID=$!
sleep 2
curl -s http://localhost:8001/api/health
kill $UVICORN_PID
```

Expected: `curl` prints `{"status":"ok","environment":"development"}`. The `kill` cleans up the backgrounded uvicorn.

- [ ] **Step 16: Verify Ruff passes**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run ruff check`
Expected: `All checks passed!` or no output with exit 0.

- [ ] **Step 17: Verify mypy passes**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run mypy src`
Expected: `Success: no issues found in N source files`.

- [ ] **Step 18: Verify pytest collects (no tests)**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight/apps/api && uv run pytest`
Expected: `no tests ran in X.XXs` with exit 0 (pytest treats no-tests-collected as success by default in 8.x; if not, `uv run pytest --no-header` still exits 0 when nothing is collected).

If pytest exits non-zero with `no tests collected`, add the following to `pyproject.toml` under `[tool.pytest.ini_options]`:
```toml
# Allow empty test runs during scaffolding
```
Actually, the correct flag is to accept exit code 5 as OK. Verify behavior: pytest 8.x returns exit code 5 for "no tests collected." To make `pnpm test` work, we'll handle this in the root `test` script (Task 5 verification).

- [ ] **Step 19: Update root `pnpm install` expectation**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm install`

(This time WITHOUT `--ignore-scripts` — the postinstall should succeed because `apps/api` now exists and has `pyproject.toml`.)

Expected: pnpm installs, postinstall runs `uv sync --project apps/api`, no errors.

- [ ] **Step 20: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api pnpm-lock.yaml
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add apps/api — FastAPI + uv with /api/health endpoint

FastAPI app with typed Pydantic BaseSettings, one health-check
endpoint returning ok + environment. Ruff strict lint, mypy
strict, pytest + pytest-asyncio + httpx installed as dev deps.
Package.json stub allows pnpm to treat apps/api as a workspace
member for Turbo orchestration while uv remains the authoritative
Python tool inside.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Verify dev orchestration end-to-end

**Files:** No new files — this task verifies that root scripts work with both apps existing.

- [ ] **Step 1: Verify `pnpm typecheck` at the root**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm typecheck`

Expected: Turbo runs `typecheck` in `packages/shared`, `apps/web`, and `apps/api`. Each workspace's `typecheck` script invokes its own tool (tsc for JS, `uv run mypy src` for api). Overall exit 0.

- [ ] **Step 2: Verify `pnpm lint` at the root**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm lint`

Expected: Turbo runs `lint` across all workspaces. `apps/api`'s lint script delegates to `uv run ruff check`. Exit 0.

- [ ] **Step 3: Verify `pnpm build` at the root**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm build`

Expected: Turbo builds `packages/shared` first, then `apps/web`. `apps/api`'s `build` script runs `uv build` which builds a wheel — no runtime impact but verifies the toml is valid.

- [ ] **Step 4: Verify `pnpm test` exits clean**

Run: `cd /Users/exexporerporer/Projects/Grade-Sight && pnpm test`

Expected: Turbo runs `test` scripts (each echoes "no tests yet" for workspaces that have no tests), then `uv run pytest` in `apps/api`. Pytest may exit 5 ("no tests collected"). If so, update `apps/api/package.json`'s test script to handle exit 5:

```json
{
  "scripts": {
    "test": "uv run pytest --exitfirst; [ $? -eq 5 ] && exit 0 || exit $?"
  }
}
```

Rerun and confirm `pnpm test` now exits 0.

Actually, the cleaner fix is to use pytest's own flag. Pytest 8.x doesn't have a built-in "allow empty" flag, but we can add a conftest-level sentinel. Simplest portable fix: replace the api package's `test` script with:

```json
{
  "test": "uv run pytest; exit_code=$?; [ $exit_code -eq 5 ] && exit 0 || exit $exit_code"
}
```

Use the Edit tool to apply this change. Then rerun `pnpm test`.

- [ ] **Step 5: Verify `pnpm dev` boots both apps (interactive check)**

This step requires a terminal to remain open. The implementer subagent should:

1. Start `pnpm dev` as a background process using `run_in_background` or an equivalent mechanism:
   ```bash
   cd /Users/exexporerporer/Projects/Grade-Sight && pnpm dev &
   DEV_PID=$!
   ```
2. Wait ~10 seconds for both servers to start:
   ```bash
   sleep 10
   ```
3. Probe both endpoints:
   ```bash
   curl -s -o /dev/null -w "web: %{http_code}\n" http://localhost:3000
   curl -s http://localhost:8000/api/health
   ```
   Expected:
   ```
   web: 200
   {"status":"ok","environment":"development"}
   ```
4. Kill the dev process group:
   ```bash
   kill -TERM $DEV_PID
   # concurrently runs both children; TERM on parent should cascade. If children linger:
   pkill -f "next dev" || true
   pkill -f "uvicorn" || true
   ```

Report the outputs of both curl commands. If either fails, investigate which child didn't start (look for port-in-use errors, missing deps, etc.).

- [ ] **Step 6: Commit any fixes from Step 4 or Step 5**

If `apps/api/package.json` was edited in Step 4, commit it:

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add apps/api/package.json
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Fix pnpm test exit code for empty pytest suite

pytest 8.x exits 5 when no tests are collected. Wrap the api test
script to treat exit 5 as success so root-level pnpm test succeeds
during Spec 1 scaffolding.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If no edits were needed, no commit. Task 5 is verification-only in that case.

---

## Task 6: Documentation

**Files:**
- Create: `README.md`, `infra/README.md`

- [ ] **Step 1: Create `infra/` directory**

Run: `mkdir -p /Users/exexporerporer/Projects/Grade-Sight/infra`

- [ ] **Step 2: Write `infra/README.md`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/infra/README.md`

Content (exactly):
```markdown
# Infrastructure

Grade-Sight deploys to [Railway](https://railway.app/), US region, pinned. Each
app in `apps/` is a separate Railway service.

## Services

| Service | Source directory | Healthcheck | Port (runtime) |
|---|---|---|---|
| `web` | `apps/web` | `/` | `$PORT` |
| `api` | `apps/api` | `/api/health` | `$PORT` |

Each service reads its build + deploy config from `apps/<name>/railway.json`.

## Setting up Railway (manual, first time)

1. Create a Railway project for Grade-Sight.
2. Add a service called `web`, connect this GitHub repo, set **Root Directory**
   to `apps/web`. Railway picks up `apps/web/railway.json` automatically.
3. Add a service called `api`, same repo, set **Root Directory** to `apps/api`.
4. For both services, set **Region** to a US region (e.g. `us-west`). This is a
   UI-only setting at the time of writing — not expressible in `railway.json`.
5. Configure environment variables in each service's **Variables** tab. See
   `apps/web/.env.example` and `apps/api/.env.example` for the required keys
   (Spec 1 requires only `NEXT_PUBLIC_API_URL` on web; `API_PORT`, `CORS_ORIGIN`,
   `LOG_LEVEL`, `ENVIRONMENT` on api).
6. On the web service, set `NEXT_PUBLIC_API_URL` to the api service's public
   URL (Railway shows it once the service has deployed once).

## Adding Postgres (Spec 2, not yet)

When Spec 2 lands:
1. Add a Railway-managed Postgres instance in the same project.
2. Reference its connection string from the api service as `DATABASE_URL`
   (Railway sets this automatically when you link the DB to the service).

## No deploys happen automatically

CI/CD is deferred until a later spec. For now, Railway builds on git push to
the configured branch, but no protected main-branch gating is wired up.
```

- [ ] **Step 3: Write root `README.md`**

Path: `/Users/exexporerporer/Projects/Grade-Sight/README.md`

Content (exactly):
````markdown
# Grade-Sight

Diagnostic grading platform for secondary math — identifies *why* students lose
points via a four-category error taxonomy, with longitudinal tracking per
student.

See `docs/PROJECT_BRIEF.md` for the product thesis, `CLAUDE.md` for durable
project rules (auto-loaded by Claude Code), and `docs/superpowers/specs/` for
design specs.

## Repo layout

```
apps/
  web/        Next.js 14+ (App Router) + Tailwind + shadcn/ui
  api/        Python FastAPI
packages/
  shared/     TypeScript types shared across JS apps
infra/        Deployment docs (Railway)
docs/         Product brief, design specs, implementation plans
```

## Prerequisites

- **Node** 20+ (`node --version`)
- **pnpm** 9+ (`pnpm --version`). Install via `npm install -g pnpm@9`.
- **Python** 3.12+ (`python3.12 --version`)
- **uv** 0.5+ (`uv --version`). Install via `curl -LsSf https://astral.sh/uv/install.sh | sh`.

## Install

```bash
pnpm install
```

This runs `uv sync` in `apps/api` automatically via a `postinstall` hook, so a
single command bootstraps both ecosystems.

## Dev

```bash
pnpm dev
```

Starts both apps in one terminal:

- `apps/web` on <http://localhost:3000>
- `apps/api` on <http://localhost:8000> (health: <http://localhost:8000/api/health>)

## Other commands

```bash
pnpm build        # Build all workspaces (packages/shared, apps/web, apps/api)
pnpm typecheck    # tsc --noEmit across JS; mypy strict on apps/api
pnpm lint         # ESLint on JS; Ruff on apps/api
pnpm format       # Prettier on JS; Ruff format on apps/api
pnpm test         # Vitest + pytest harnesses (no tests in Spec 1 — exits 0)
```

## Environment variables

Each app has its own `.env.example` with required + forward-looking (commented)
keys. Copy to `.env.local` (web) or `.env` (api) for local dev:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

`.env` and `.env.local` are gitignored; never commit secrets.

## Deployment

See `infra/README.md` for Railway setup. Two services (`web`, `api`), US region,
independent deploys.

## Contributing

This repo is developed in tight collaboration with Claude Code. Before starting
any feature work, review `CLAUDE.md` for the active scope gates and working
agreements.
````

- [ ] **Step 4: Commit**

```bash
git -C /Users/exexporerporer/Projects/Grade-Sight add README.md infra/
git -C /Users/exexporerporer/Projects/Grade-Sight commit -m "$(cat <<'EOF'
Add root README and infra/README for Railway deployment

Root README covers prerequisites, install, dev flow, and pointers
to env examples. infra/README documents per-service Railway setup,
region pinning instructions, and the deferred Postgres wiring for
Spec 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Acceptance run (verification only, no commit)

**Files:** None — this task re-runs the acceptance criteria against the fully scaffolded repo to confirm everything works from a clean state.

- [ ] **Step 1: Clean install from scratch**

Run:
```bash
cd /Users/exexporerporer/Projects/Grade-Sight
rm -rf node_modules apps/web/node_modules apps/web/.next packages/shared/node_modules packages/shared/dist apps/api/.venv .turbo apps/web/.turbo
pnpm install
```

Expected: fresh install succeeds, postinstall runs `uv sync` and creates `apps/api/.venv/`, no errors.

- [ ] **Step 2: Run full verification suite**

```bash
cd /Users/exexporerporer/Projects/Grade-Sight
pnpm typecheck && echo "✓ typecheck"
pnpm lint && echo "✓ lint"
pnpm build && echo "✓ build"
pnpm test && echo "✓ test"
```

Expected: all four commands exit 0 with the marker echoes. Stop on first failure.

- [ ] **Step 3: Boot check**

Run `pnpm dev` as a background process, wait 10 seconds, probe both endpoints, and tear down (same pattern as Task 5 Step 5).

Expected: `web: 200` and `{"status":"ok","environment":"development"}`.

- [ ] **Step 4: Verify all acceptance criteria from the spec**

Walk through the spec's "Acceptance Criteria" section point by point:

| # | Criterion | How to verify |
|---|---|---|
| 1 | Fresh-clone install succeeds | Step 1 above |
| 2 | `pnpm dev` boots both, /api/health returns ok | Step 3 above |
| 3 | `pnpm typecheck` passes | Step 2 above |
| 4 | `pnpm lint` passes | Step 2 above |
| 5 | `pnpm build` builds shared then web | Step 2 above |
| 6 | `pnpm test` exits 0 | Step 2 above |
| 7 | `packages/shared/src/index.ts` exports required types | `cat packages/shared/src/index.ts` and confirm |
| 8 | `README.md` documents prereqs + commands | `cat README.md` and confirm |
| 9 | `.gitignore` covers all required patterns | `grep -E "node_modules|\.next|dist|__pycache__|\.venv|\.env" .gitignore` |
| 10 | Railway configs exist per app + `infra/README.md` exists | `ls apps/web/railway.json apps/api/railway.json infra/README.md` |

For each criterion, report pass/fail. If all ten pass, report overall PASS for Spec 1.

- [ ] **Step 5: Report final state**

No commit. Report to the user:
- Commits landed in this plan (5 commits from Tasks 1-6, possibly 6 if Task 5 Step 6 triggered).
- Working tree status: should be clean (all work committed).
- `git log --oneline` since plan start.
- Whether all acceptance criteria passed.

If any criterion failed, loop back to the failing task, fix, commit as a follow-up.

---

## Completion criteria (plan-level)

- All 10 acceptance criteria from the spec pass.
- All tasks 1-6 committed individually to `main` (no long-running branch; clean linear history).
- `main` is ahead of `origin/main` by 5-6 commits; pushing is a separate user decision (not part of this plan).
- `CLAUDE.md` current-phase line can be updated to reflect "Spec 1 scaffolding complete" — propose that edit to the user after Task 7 passes; do NOT apply without approval per the commit-on-request rule.
