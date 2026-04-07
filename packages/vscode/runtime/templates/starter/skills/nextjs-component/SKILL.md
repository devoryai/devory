---
name: Next.js App Router Component
version: 1
tags: [nextjs, app-router, react, server-components, client-components, typescript]
---

# Next.js App Router Component

## When to Use

This skill applies when the task involves any of the following:

- Implementing a new page, layout, or component in a Next.js App Router project (`apps/devory` or `../devory-website`)
- Modifying an existing component that may need Server/Client boundary changes
- Debugging a component that has hydration errors, incorrect `"use client"` placement, or data fetching in the wrong layer
- Implementing a new route segment: `page.tsx`, `layout.tsx`, `loading.tsx`, or `error.tsx`

This skill does NOT apply to tasks using the Pages Router (legacy `pages/` directory), React Native, or non-Next.js React projects.

## What This Skill Covers

- The Server Component vs Client Component decision and the criteria for making it
- File placement conventions under `app/` for pages, layouts, and co-located components
- Prop typing requirements for all components
- The data-flow rule: data fetches in Server Components, passed down as props to Client Components
- Suspense boundary placement and when to use `loading.tsx` vs inline `<Suspense>`
- The `"use client"` directive placement rule (push it as far toward the leaf as possible)
- How to avoid the most common App Router constraint violations

## What This Skill Does Not Cover

- General React patterns, component composition, and state management principles: see `doctrine/architecture-rules.md`
- Testing requirements for components: see `doctrine/testing-standard.md`
- CSS, styling conventions, or design system usage: see `doctrine/code-style.md`
- Database queries or Supabase data access called from Server Components: see `skills/database-migration/SKILL.md` or `skills/sql-query-analysis/SKILL.md` for data concerns
- API route handlers (`route.ts`): those follow the thin-handler pattern in `doctrine/architecture-rules.md`, not this skill

## Inputs

Before following this skill, confirm you have:

- A clear description of what the component should render and what data it needs
- The target directory or route segment where the component will live
- The parent component or page that will render this component (to understand the data flow context)
- Knowledge of whether any interactivity, browser APIs, or event handlers are required

## Procedure

1. Read the task description fully. Identify: what does this component render, what data does it need, and does it require any user interaction or browser APIs?

2. Make the Server vs Client decision:
   - **Use a Server Component (default)** if the component only renders data, calls `async` operations, or has no event handlers or state.
   - **Use a Client Component (`"use client"`)** if the component needs: `useState`, `useEffect`, `useRef`, event handlers (`onClick`, `onChange`, etc.), browser-only APIs (`window`, `localStorage`, `navigator`), or third-party libraries that require the browser context.
   - When in doubt, start as a Server Component. Add `"use client"` only when a concrete requirement forces it.

3. Place `"use client"` as close to the leaf of the component tree as possible. If only one small interactive element in a larger component tree needs client behavior, extract that element into its own file and add `"use client"` there — not at the parent.

4. Place the file in the correct location:
   - Route entry points: `app/<route>/page.tsx` for pages, `app/<route>/layout.tsx` for layouts
   - Co-located components: same directory as the page that uses them, or in a `components/` directory within the feature route
   - Shared components: `components/` at the app root

5. Define a TypeScript interface or type for the component's props at the top of the file. Every prop must have an explicit type. Do not use `any`. If a prop is optional, mark it with `?`.

6. If the component is a Server Component that fetches data: add `async` to the function signature and use `await` for data calls. Do not use `useEffect` for data fetching in Server Components — Server Components are already async.

7. If the component is a Client Component that needs data: receive the data as props passed down from a parent Server Component. Client Components must not call `fetch` in `useEffect` to load application data. The exception is client-side user interactions that trigger mutations or on-demand fetches (e.g., search suggestions, form submissions).

8. Add a `<Suspense>` boundary around any async Server Component that may be slow:
   - Use `loading.tsx` in the route segment when the entire page should show a loading state
   - Use an inline `<Suspense fallback={...}>` wrapper when only part of the page is async and the rest should render immediately
   - The fallback should be a meaningful skeleton or placeholder, not `null`

9. For list rendering: always provide a `key` prop on the root element of each list item. Use a stable, unique identifier (typically an `id` field), not the array index.

10. Run `npm run build` before marking the task done. Next.js App Router violations (Server Component importing a Client Component incorrectly, missing `async`, misplaced `"use client"`) surface as build errors. The dev server may not catch all of them.

11. Run `npm run lint` and confirm no warnings remain in the affected files.

## Outputs / Verification

Expected outputs:
- A new or modified `.tsx` file in the correct `app/` location or `components/` directory
- A TypeScript interface or type for the component's props
- No `"use client"` on a component that has no interactivity requirement

Verification:
- `npm run build` passes with no App Router constraint errors
- `npm run lint` passes
- Server Components have no `useState`, `useEffect`, or event handler imports
- Client Components do not call `fetch` or use `async/await` at the top level for data loading
- No component has `key={index}` on list-rendered items unless the list is static and never reordered
- If the component is async: it has `async` on the function signature and `await` on data calls

## Common Mistakes

1. **Adding `"use client"` to a parent layout or page when only a small child element needs it.** This converts the entire subtree to a Client Component, removing Server Component benefits (streaming, zero JS overhead, direct async data access) from the whole page. Extract the interactive element and mark only that file with `"use client"`.

2. **Fetching data in a Client Component using `useEffect`.** This causes a waterfall: the component renders empty, the effect fires after paint, data loads, the component re-renders. Instead, fetch in a Server Component and pass data down as props, or use a Server Action for mutations.

3. **Forgetting `async` on a Server Component that calls `await`.** TypeScript may not catch this in all configurations. The component silently returns a Promise instead of the rendered output, causing a blank render or a hydration error.

4. **Importing a Server Component from a Client Component.** Next.js will reject this at build time. If a Client Component needs to render a Server Component subtree, pass it as a `children` prop from a Server Component parent instead.

5. **Using `key={index}` on list items that can be reordered, filtered, or dynamically added.** Array index keys cause React to re-use DOM nodes incorrectly when the list changes, producing visual glitches and broken state in stateful child components.

6. **Mixing `loading.tsx` and inline `<Suspense>` for the same route segment without understanding precedence.** `loading.tsx` is syntactic sugar for a Suspense boundary wrapping the entire page. Adding an inline `<Suspense>` around the same content creates nested boundaries with potentially confusing fallback behavior. Use one or the other per logical loading region.

7. **Placing shared components inside a route-specific directory.** A component placed in `app/queue/components/` is not importable from `app/board/` without a relative path that crosses route boundaries. Components used across multiple routes belong in `components/` at the app root or in a dedicated shared directory.
