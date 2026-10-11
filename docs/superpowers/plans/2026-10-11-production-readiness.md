# Production readiness implementation plan

**Goal:** A fresh deployment starts with no demo users or bookings, persists its database, and protects private booking data.

**Architecture:** Keep Express and Prisma 5 with SQLite for a single application instance. Apply checked-in migrations on container startup; use an explicit, non-destructive admin and real-room bootstrap. Production configuration fails closed.

**Constraints:** Preserve the existing local database. Do not deploy, push, or invent production credentials. Work in the current checkout as authorized by the user's request to apply the audit fixes now.

## Tasks

- [x] 1. Add regression tests for production config, clean startup and bootstrap, seed refusal, private calendar/detail access, database health, and real Wi-Fi input. Run them before implementation to record the failures.
- [x] 2. Require production secrets, HTTPS URL, absolute SQLite path and real SMTP settings. Restrict CORS, add configured proxy trust and database readiness, and sanitize server errors.
- [x] 3. Add an initial schema-only migration and idempotent bootstrap with operator-provided admin details and room settings. Refuse demo seeding outside explicit development mode. Exclude databases, secrets and demo assets from Docker and Git while keeping the local database intact.
- [x] 4. Authenticate calendar reads and project public schedule fields; require ownership or staff role for booking details. Remove fixed passwords from user management.
- [x] 5. Remove demo login, dates, identities, voucher values and automatic fake Wi-Fi credentials. Only include explicitly configured Wi-Fi in bookings.
- [x] 6. Configure a non-root Node LTS image with writable volume, startup migration, and DB-backed health check. Add production environment template and deployment/backup instructions. Actual image build deferred.
- [ ] 7. Run regression and existing tests using disposable databases, validate Compose, build and smoke-test Docker if the local daemon becomes available, review the entire diff, and report remaining infrastructure limits.

## Review focus

Existing database safety, bootstrap reruns without password changes, container volume ownership, credential leakage in calendar/stat responses, and migrations across restart. No existing database or production volume may be reset.

## Execution record

The user's approval authorizes direct implementation of the prior audit. No extra design/worktree approval is requested. Tests and Docker runs use temporary data only; changes remain reviewable in the workspace without an automatic commit or push.

The initial regression run reproduced all 11 gaps before implementation. The user subsequently requested skipping tests to prioritize deployment. Do not run further test suites or container smoke tests; finish configuration and source review and report verification as deferred. Docker Desktop also reports that its daemon cannot start locally.

Source review identified and fixed two integration gaps: shared schedule entries no longer fetch restricted details for unrelated users; notification delivery occurs after reservation commit and failures produce a warning while preserving the booking. Final static verification: JavaScript syntax checks and `docker compose config --quiet` passed; `git diff --check` passed. Package lock refreshed for runtime Prisma CLI. Regression suites, image build and runtime verification remain explicitly deferred, with no passing-test claim.

Follow-up requirement: the administrator enters real Wi-Fi credentials once per meeting month through a Wi-Fi Bulanan menu. A new additive migration creates WifiMonthlySetting without inserting records. All booking detail/list/create/reschedule responses derive credentials from the meeting date's month, so legacy or client-supplied per-booking overrides cannot diverge. Existing vouchers read the latest monthly setting when reopened; missing months have no credential fallback. Calendar and shared statistics remain credential-free. Prisma Client generation is required source preparation, not a test; tests continue to be skipped by user instruction.

Monthly source review fixes: QR generation now counts/writes UTF-8 bytes for real SSIDs and passwords; logout/session changes clear credential DOM and voucher state, invalidate pending monthly loads, and prevent a stale voucher response from crossing sessions. Monthly runtime tests and browser verification remain deferred.
