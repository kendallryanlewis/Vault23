# Vault23 — Workspace Copilot Instructions

## Code Hygiene: No Dead Code

**Always rewrite, never abandon.**

- When modifying code, remove every piece it replaces. Old implementations, old function signatures, superseded branches, and commented-out blocks must be deleted — not left behind.
- If a function, variable, import, or type is no longer referenced after a change, delete it immediately.
- Prefer a complete replacement of a code unit (function, class, module) over a partial patch that leaves unused fragments.
- Do not leave `// TODO: remove`, `// OLD`, or redundant commented code in the codebase. Either act on it now or delete the comment.

## Code Understanding First

- Before modifying any file, read it fully enough to understand its role and all call sites affected by the change.
- When the change is non-trivial, verify neighbouring files that import or depend on the modified code and update them in the same pass.
- Never assume what a function does — read it.

## Build Verification (Required After Every Change)

After any edit to Angular or Swift files, verify the affected layer builds without errors or warnings before finishing.

**Angular (`closet-web/`)**
- Run `cd closet-web && ng build --configuration development` after changes to `.ts`, `.html`, or `.scss` files.
- Zero errors required. Resolve all TypeScript and template compilation errors before handing back.
- Common pitfalls: unused imports, Observable/Promise type mismatches, missing `inject()` providers, template binding errors.

**Swift (`ClosetApp/`)**
- Run `xcodebuild -project ClosetApp.xcodeproj -scheme Vault23 -destination "generic/platform=iOS Simulator" build` after changes to `.swift` files.
- Zero errors required. Swift 6 strict concurrency is enabled — fix all `Sending`, `@MainActor`, and actor isolation warnings.
- Common pitfalls: non-`Sendable` types crossing actor boundaries, missing `@MainActor` annotations, `nonisolated` methods capturing `@MainActor` state.

**If a build fails**, resolve all errors in the same turn before completing the task. Do not hand back while errors remain.

## General Conventions

- Smallest change that solves the problem (no speculative features or abstractions).
- Match the existing code style exactly (naming, indentation, file organization).
- No new comments or docstrings on unchanged code.
- Validate only at system boundaries (user input, external APIs) — trust internal contracts.
