# Security Checklist

Apply each item below to the code under review. Flag violations as findings with the appropriate severity level. This checklist focuses on common vulnerability patterns -- not all items apply to every codebase or language. Skip items silently when they are irrelevant to the code at hand.

## Secrets and Credentials

- No hardcoded secrets (passwords, API keys, tokens, connection strings, private keys) in source code, configuration files, or test fixtures. Check string literals, default parameter values, and constant definitions for credential-like patterns.
- No secrets in log output, error messages, or user-facing responses. Verify that caught exceptions and formatted error strings do not interpolate sensitive variables.
- Secrets loaded from environment variables, secret stores, or encrypted configuration. The code path from secret source to usage should not pass through intermediate variables that could be serialized or logged.
- `.gitignore` covers common secret file patterns (`.env`, `*.pem`, `*.key`, `credentials.*`, `*.p12`). New secret-bearing file types introduced in the diff should have corresponding ignore rules.
- Test fixtures use obviously fake values (`FAKE_API_KEY_FOR_TESTING`, `test-only-password`), not production-like strings that could be confused with real credentials or accidentally authenticate against staging environments.

## Input Validation

- All external input (user forms, API parameters, URL segments, HTTP headers, file uploads, CLI arguments) is validated before use. Validation should occur at the system boundary, before input reaches business logic.
- Validation uses allowlists when the set of valid inputs is known. Denylists are acceptable only when the valid set is unbounded, but recognize that they are inherently bypassable via encoding tricks or novel payloads.
- Numeric inputs are range-checked to prevent overflow, underflow, and nonsensical values. String inputs are length-limited to prevent memory exhaustion and buffer-related issues.
- File paths from external input are normalized (resolve `..`, symbolic links) and confined to expected directories. Use platform-provided path resolution APIs rather than manual string manipulation.
- Regex patterns derived from user input are bounded in complexity to prevent ReDoS (Regular Expression Denial of Service). Consider timeouts or complexity limits on user-supplied patterns.
- Deserialization of untrusted data uses schema validation (JSON Schema, Zod, io-ts, Pydantic) before the data reaches application logic. Blindly trusting the shape of parsed input is a common source of type confusion and prototype pollution.

## Output Encoding

- User-supplied data is encoded or escaped appropriate to its output context: HTML entity encoding for web pages, parameterized queries for SQL, shell escaping for command arguments, percent-encoding for URLs, proper escaping for JSON string values.
- Template engines use auto-escaping by default. Any use of raw or unescaped output (`| safe`, `dangerouslySetInnerHTML`, `{!! !!}`) is explicitly justified with a comment explaining why it is safe.
- HTTP responses include appropriate security headers: `Content-Type` with correct charset, `X-Content-Type-Options: nosniff`, and relevant CSP headers for HTML responses.
- Error responses do not leak internal details: no stack traces, database schemas, file system paths, server version strings, or internal IP addresses in responses visible to end users.
- Content-Disposition headers are set correctly for file downloads to prevent browsers from interpreting uploaded files as executable content (e.g., HTML files served inline from a user-upload path).

## Authentication and Authorization

- Auth checks are present on all protected endpoints and operations. Verify that new routes or handlers added in the diff include authentication middleware or equivalent checks consistent with the existing codebase pattern.
- Auth logic is centralized (middleware, decorators, guards) rather than duplicated per handler. Inline auth checks in individual handlers are fragile and prone to inconsistency.
- Session tokens and API keys are cryptographically random with sufficient entropy and have bounded lifetimes. Check that token generation uses the platform's cryptographic RNG, not general-purpose random functions.
- Password comparison uses constant-time comparison functions to prevent timing attacks. Standard equality operators (`==`, `===`, `strcmp`) leak information about which character position differs.
- Failed authentication attempts are rate-limited, logged for monitoring, or both. Unlimited login attempts enable brute-force and credential-stuffing attacks.
- Privilege escalation paths are guarded. Operations that change a user's role, permissions, or access level require verification that the caller has the authority to grant those privileges.

## Cryptography

- No custom cryptographic implementations. Use well-established libraries (OpenSSL, libsodium, Web Crypto API, `crypto` module). Hand-rolled crypto is virtually guaranteed to contain exploitable flaws.
- Hashing for integrity uses current algorithms (SHA-256 or stronger). Password hashing uses dedicated slow-hash algorithms (bcrypt, scrypt, argon2) with appropriate work factors, not fast hashes like SHA or MD5.
- No deprecated algorithms used for security purposes: MD5, SHA-1, DES, RC4, and ECB mode are all broken for security use cases. Their presence in new code is a finding.
- Random values for security purposes (tokens, nonces, IVs, keys) use a cryptographic RNG (`crypto.randomBytes`, `secrets.token_bytes`, `SecureRandom`), never `Math.random`, `rand()`, or similar non-cryptographic generators.
- Encryption keys meet minimum strength requirements: 256 bits for symmetric algorithms (AES-256), 2048 bits for RSA, 256 bits for elliptic curve. Keys below these thresholds are vulnerable to brute-force with current hardware.

## Dependency Hygiene

- New dependencies are from trusted, actively maintained sources. Check that the package has a credible maintainer, reasonable download counts, and recent activity. Single-maintainer packages with no community are higher risk.
- No dependencies with known critical or high CVEs. When a new dependency or version bump appears in the diff, check advisory databases (GitHub Advisories, npm audit, Snyk) for known vulnerabilities.
- Dependency versions are pinned or managed by a lockfile. Unpinned ranges (`^`, `~`, `*`) can silently resolve to a compromised version in a future install without any code change.
- Dev dependencies are not included in production bundles. Build tools, test frameworks, and linters in `dependencies` (rather than `devDependencies`) bloat the attack surface and may expose development-only functionality.
- Post-install scripts in new dependencies are reviewed for suspicious behavior. Malicious packages commonly use install hooks to exfiltrate environment variables or download additional payloads.

## Data Protection

- PII and sensitive data are not logged without explicit redaction. Check log statements, debug output, and error messages for interpolation of user emails, names, phone numbers, IP addresses, or financial identifiers.
- Sensitive data at rest is encrypted when the platform supports it. Plaintext storage of credentials, tokens, health data, or financial records is a finding when encrypted alternatives are available.
- Data retention follows the principle of minimization: collect and store only what is necessary for the operation. Unnecessary accumulation of sensitive data increases breach impact.
- Secure defaults are used for data transmission. Network calls use TLS; fallback to unencrypted channels requires explicit opt-in, not silent degradation.
- Temporary files containing sensitive data are cleaned up after use. Check that `tmp` files, cache entries, and intermediate artifacts with sensitive content are deleted in all exit paths, including error paths.
