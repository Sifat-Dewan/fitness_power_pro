# Fitness Power: production SQL fix and actual gym data migration

This update fixes the overview `42803` error, adds a protected read-only Legacy Ledger page, preserves all source CSV transactions, and removes fabricated marketing metrics and fake default plan/locker inserts.

## What was actually supplied

- 277 member records; 4 membership plans.
- 3,464 historical `CostRecord` entries (all categorized `MEMBERSHIP_PLAN` or `RENEW_MEMBERSHIP_PLAN`). **These are revenue-like entries, not expense records.**
- 309 historical transactions reference one of the supplied member Mongo IDs. The importer writes these into the main `payments` table using `method="unknown"` (the old export has no payment method), with a unique `LEGACY:` reference.
- 3,155 transactions have **no member ID**. The importer retains all 3,155 in `legacy_cost_records`, counts their amounts in the revenue dashboard, and makes them viewable at `/legacy-ledger`. It deliberately does not fabricate member associations.
- The imported 309 transactions also remain in the archive as source records, but are excluded from separate archive revenue aggregates so totals are not double counted.
- 61 member phone values are missing/invalid under the 11-digit validation rule, one record is missing gender, and four legacy member-number values are duplicated. The importer keeps missing fields empty/null, retains all original values in `legacy_member_sources`, and assigns unique new numbers to the duplicate occurrences.
- Only the current membership period is available per member; historic renewals cannot be reconstructed precisely from the export. One current membership period per member is imported.
- No attendance, locker assignment, locker inventory, staff, or genuine expense exports were supplied. The importer does not fabricate them. Cloudinary images that weren't uploaded to this Cloudinary account require manual re-upload; the raw source image values are retained in the legacy source archive.

## Installation (use a Neon backup or cloned branch first)

1. Stop Next.js. Back up the Neon database or create a Neon branch to test this migration. **Never run a migration against production data without first checking it.**
2. Extract `fitness-power-production-patch.zip` directly into the EXISTING project directory, allowing source files to be replaced. Your `.env.local` is not included or modified.
3. Extract `fitness-power-private-legacy-data.zip` into the SAME project directory, producing `private/legacy/Member.csv`, `MembershipPlan.csv`, and `CostRecord.csv`. These sensitive CSVs are gitignored; DO NOT commit or post them publicly.
4. Set `DEMO_MODE="false"` and `DATABASE_URL` in your `.env.local`. Review the target Neon database/branch.
5. Run each command separately, stopping if one fails:

```powershell
npm run typecheck
npm run db:push
npm run db:seed
npm run db:import-legacy
```

`db:import-legacy` is a dry-run by default; it makes **no writes**. Check the reported counts against `LEGACY-AUDIT.json`. `db:seed` now initializes gym settings only, with zero demo plans, people, lockers, or transactions.

6. Once you have a verified backup and the dry-run matches, temporarily add this to `.env.local`:

```env
ALLOW_LEGACY_IMPORT="I_HAVE_BACKED_UP_NEON"
```

Then run:

```powershell
npm run db:import-legacy -- --apply
npm run typecheck
npm run build
npm run dev
```

7. Sign in as your EXISTING Better Auth admin. Visit `/members`, `/plans`, `/payments`, `/legacy-ledger`, `/dashboard`, `/reports`, and compare member balances/revenue with the archive. Team Access is untouched. Re-running the importer uses stable IDs and does not duplicate existing imported records. Review existing default plans from earlier `db:seed` scripts manually; don't delete a plan that has linked members.
8. Remove the temporary `ALLOW_LEGACY_IMPORT` variable when complete, and remove private CSVs from the laptop if no longer needed. Retain a secured backup.
9. Push only source changes (not `private/legacy` or `.env.local`) to GitHub. After the new table has been created in the target production Neon database, deploy the code to Vercel. Production must have matching `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL`.

## Caveats

- This is an initial data migration requiring validation, **not a certification that every feature is production-ready**. Test auth/permissions, CSV exports, renewal accounting, payments, Cloudinary, responsive views, cron attendance, and rollback on a staging database before accepting real transactions.
- The legacy ledger shows historical amounts even where member references are missing. These entries were not definitively verified against bank receipts; treat them as a historical source ledger rather than audited accounting.
- Cost records have no explicit currency; the dashboard assumes BDT based on the current gym settings.
- Dates are converted from the supplied UTC timestamps to the `Asia/Dhaka` calendar date. Existing records are not automatically overwritten by a repeat import.
- A full live Neon test was not possible because database credentials were not accessed here.
