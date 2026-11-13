# Fitness Power — November 2026 update

This **source-code patch** upgrades the existing Next.js + Neon + Cloudinary project. It does not create a new database or reset users, plans, payments, members, or Team Access.

## Included

- Date-aware pending memberships and warning status badges: yellow with 7–4 days, red with 3–0 days left. Expired remains expired. Locker expiry uses its assignment due date, or the member's membership expiration if due date is empty.
- Members: Assign locker and individual payment history in row actions and profile drawer.
- Required member phone starting `01` with exactly 11 digits and a required gender, validated in the form, API, and CSV import.
- Standard-size lockers only, without a size picker in the create/edit dialog.
- Attendance sessions automatically close 3 hours after check-in; manual checkout remains intact. Auto-completion writes the check-out timestamp as check-in time + 3 hours, not the later request timestamp.
- Paginated list endpoints for Members, Attendance, Lockers, Payments, Plans, Expenses, Staff and Activity (20 records per request). Filters and searching happen in Neon. Table and grid views show numbered pages with ellipses.
- CSV export streams the full record set in batches without imposing the old first-1,500/3,000-record limit. This is separate from on-screen pagination.
- Number fields begin empty instead of `0`; editing existing zero-valued fields clears the zero on focus.
- Crop member/staff/receipt images before Cloudinary upload; tap member portraits to enlarge and tap outside to close.
- Red-gradient primary actions and neutral-black dark mode, mobile header without breadcrumb, five-item mobile bottom navigation, transparent profile button.
- More efficient SQL-based overview aggregations, small Cloudinary thumbnail URLs, and on-demand per-route component loading.
- Team Access account creation and permissions are **not** modified.

## Apply to your existing project (PowerShell)

1. Make a backup or commit your current working project. Consider creating a Neon database branch to test without risking real records.
2. Stop the local Next.js server with `Ctrl + C`.
3. Download `fitness-power-upgrade-patch.zip` into Downloads, and **run the following in your project folder**:

```powershell
Expand-Archive -Path "$HOME\Downloads\fitness-power-upgrade-patch.zip" -DestinationPath . -Force
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
npm run typecheck
npm run build
npm run dev
```

If your repo contains custom edits to files modified by this patch, review the diff before extracting with `-Force`.

**Database:** No schema migration or `db:push` required, since this update does not modify `src/db/schema.ts`.

**Credentials:** Keep your current `.env.local` and Vercel environment variables; the patch does not include secrets. For server-side scheduled attendance completion, see below.

**Deployment:** Only after typecheck and build pass, commit/push the source changes to GitHub. Vercel redeploys from your configured branch.

## Three-hour attendance completion

Whenever the overview or attendance list is requested, the server finalizes any sessions older than 3 hours; the check-out time stored is exactly check-in + 3 hours. A manual check-out performed earlier remains unchanged. If nobody visits the site, completion occurs the next time one of these endpoints is read.

If you need database rows finalized on a clock even when the site is idle, configure an external scheduler or supported Vercel Cron to request `GET /api/cron/attendance` with a secret header, ideally every 5–15 minutes:

```
Authorization: Bearer YOUR_RANDOM_CRON_SECRET
```

Set `CRON_SECRET` (at least 24 random characters) in Vercel's server environment. Never expose it in the browser. The endpoint refuses requests without the correctly configured secret. Cron frequency and availability depend on your Vercel plan; **no cron schedule is activated by this patch**.

## Important compatibility notes

- Existing member records with missing, formatted or international-format phone numbers will still display. Saving changes to those records now requires correcting the phone to the mandated 11-digit format and selecting gender.
- Previously seeded fictitious numbers such as `+8801000...` remain in Neon unless you edit them; new sample-seed runs generate 11-digit fictional values. The upgrade does **not** change existing members' personal information.
- Existing locker records may retain historical `size` column values in Neon, but the UI no longer offers size choices, and new/edited lockers use `standard`.
- Due-date urgency is visual/status-derived; no data is silently deleted or deactivated on expiry.
- The table header default order is a stable server order. Global column sorting is not implemented in this patch; don't assume a header sorts across pages.

## Suggested test pass before production

1. Verify a member starting next week shows **Starts in 7d** and cannot check in before the start date.
2. Verify a current member with 7 days remaining is yellow and with 3 days remaining is red.
3. Verify locker assignment via the member's row actions, a due date and release action.
4. Verify gender and phone validation (11 digits beginning `01`).
5. Check individual payment history versus the full Payments screen.
6. Create a locker and confirm there's no size selector.
7. Verify manual check-out and that an older-than-3-hour visit is auto-completed.
8. Check pagination with at least 41 members and attendance rows (pages 1, 2, 3).
9. Crop/upload a photo, then enlarge and dismiss it.
10. Test 375px mobile width and light/dark mode.
11. Confirm existing Team Access accounts still work.

## Validation completed here

Source files were checked with the TypeScript parser and the archive is validated on creation. **A full typecheck, production build, live Neon insert/query test, Cloudinary upload, and browser-based visual QA must still be done on your machine** because this environment does not have the application's npm dependencies or credentials.
