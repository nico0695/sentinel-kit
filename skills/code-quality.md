# Code Quality Checklist

Apply each item below to the code under review. Flag violations as findings with the appropriate severity level. This checklist supplements the review harness domains with specific, actionable checks.

## Naming

- Variables, functions, and types use descriptive names that reveal intent. A name should tell the reader what the value represents or what the function does without needing to read the implementation.
- Boolean variables and functions use `is`, `has`, `can`, `should` prefixes or read naturally as predicates (e.g., `isValid`, `hasPermission`, `canRetry`).
- Abbreviations are avoided unless they are well-established domain terminology (e.g., `url`, `id`, `http`). Project-specific abbreviations must be documented or self-evident from context.
- Names are consistent with the conventions used in surrounding code. A new function in a module that uses `getX` naming should not introduce `fetchX` or `retrieveX` without reason.
- Collection variables use plural nouns (`users`, `items`). Single-element variables use singular nouns.
- Avoid generic names like `data`, `result`, `info`, `temp`, or `value` unless the scope is very short (2-3 lines) and the meaning is unambiguous from context.

## Error Handling

- Errors are handled at the appropriate level, not swallowed silently. Empty catch blocks, catch blocks that only log without re-throwing, and `catch(_) {}` patterns suppress information needed for debugging.
- Error messages include enough context for debugging: what operation failed, what input triggered the failure, and where in the call chain it occurred.
- Async operations have explicit error paths. Every `await` in a try block should have a corresponding catch. Every `.then()` chain should have a `.catch()` or be awaited inside a try block.
- Retry logic, when present, has bounded attempts and exponential or linear backoff. Unbounded retries or tight retry loops risk cascading failures across the system.
- Error types are specific rather than generic. Throwing `Error("something went wrong")` loses the ability to distinguish failure modes upstream. Use typed errors or error codes.
- Functions that can fail communicate their failure modes through return types (Result, Option, union types) or through documented thrown exceptions.

## Patterns and Structure

- Functions have a single responsibility and a clear return contract. A function that validates, transforms, and persists data in one body should be decomposed into separate steps.
- Control flow is flat: guard clauses and early returns at the top, happy path below. Avoid else-after-return and deeply nested if-else trees.
- Shared logic is extracted when duplicated more than twice. Two occurrences may be coincidence; three is a pattern that warrants a shared helper.
- Dependencies flow in one direction. Module A importing Module B while Module B imports Module A creates a cycle that breaks testability and reasoning about initialization order.
- Side effects (I/O, mutations, logging, metrics) are explicit and isolated from pure computation. A function named `calculateTotal` should not also write to a database or emit events.
- State mutations are localized. Prefer returning new values over mutating shared state, especially when data crosses function or module boundaries.

## Complexity

- Functions are short enough to understand in a single reading (~30 lines guideline). If a function requires scrolling, it likely does too much.
- Conditional logic is simple. Complex boolean expressions are extracted to named predicates: `const isEligible = age >= 18 && hasConsent && !isBlocked` is clearer than inlining the full condition in an if statement.
- No unnecessary abstractions. Code solves the current problem without speculative generality (YAGNI). An interface with a single implementation and no planned second implementation is likely premature.
- Data transformations are composed from small, testable steps rather than written as monolithic mapping functions that are difficult to debug.
- Cyclomatic complexity per function stays manageable. Functions with many branches, loops, and conditions are hard to test exhaustively and fragile under maintenance changes.

## Test Quality

- New public API surface has corresponding tests. Every exported function, class, method, or endpoint introduced in the diff should have at least one test verifying its primary behavior.
- Tests exercise both the happy path and error or edge cases. A test suite that only covers the success scenario misses the most common source of production bugs.
- Test assertions are specific and meaningful. `expect(result).toBeDefined()` or `expect(fn).not.toThrow()` are weak assertions -- assert on the actual returned value or the specific error type and message.
- Test setup is minimal: each test arranges only what it needs. Shared before-each blocks that configure unrelated state make tests fragile, slow, and hard to understand in isolation.
- Mocks and stubs replace external dependencies (network, filesystem, database, time), not internal logic. Mocking the unit under test defeats the purpose of the test.
- Test names describe the scenario and expected outcome in plain language. A reader should understand what a test verifies from its name alone, without reading the test body.
- Tests are deterministic. No reliance on wall-clock time, random values, network availability, or execution order between test cases. Flaky tests erode trust in the entire suite.
