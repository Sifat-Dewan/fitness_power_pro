# Fitness Power Pro + ZKTeco K40 — staged integration guide

This is a **source-code integration**, not a live device configuration. The shipped Python connector has NOT been tested against your actual K40 firmware and the live Neon database in this environment. Use a Neon branch and a disposable test user before enabling destructive commands.

## What this patch does

- Adds a **Fingerprint Devices** dashboard page with status, device inventory, UID/User ID mapping, mismatch warnings and command history.
- Adds K40 device tables and authenticated APIs to the existing Next.js / Neon project.
- Adds a Python agent that runs on a **gym-side Windows PC on the same network** as the K40.
- The agent periodically calls `get_users()` and sends **all device users** securely to Fitness Power.
- Numeric K40 **User ID** matches the website `members.member_no`. The K40's **UID is different** and is kept in `device_users.uid`.
- Creates member profiles for device users not previously registered on the website, leaving phone, gender, email, photo, plan and dates **NULL**. Their status shows **No membership**, not **Expired**.
- Never overwrites existing website names or member contact details. Mismatches are shown for review.
- Member creation now requires only a numeric **member number** and **name**; all contact and membership fields are optional during reconciliation. The CSV import follows the same temporary rules.
- Adds explicitly confirmed, queued **delete from website + K40** for linked users. Cloud audit and payment history are preserved. Physical deletion is marked complete only after verification by the local agent.
- K40 privileged/admin accounts cannot be deleted remotely. Bulk archive cannot bypass the hardware deletion confirmation for linked members.
- **Does not** retrieve, upload or store fingerprint templates in Neon.

## Step 0: Safety and backup

Your previous machine read confirmed roughly 546 device users and 99,108 log entries. These are from the prior export and have NOT been checked live here.

1. In Neon, create a backup/branch before any schema change.
2. Keep at least two copies of the existing K40 CSV user and attendance exports.
3. Understand these CSV exports **do not contain biometric templates**. Do not delete a real member from the machine until you've tested the command with a disposable account and accepted that the fingerprint may have to be re-enrolled.
4. Do **not** choose factory reset, clear data, clear users, or clear attendance during this integration.
5. Reserve K40 MAC `00-17-61-11-92-9e` in the gym router's DHCP configuration so the known IP `192.168.0.123` remains stable.

## Step 1: Install Next.js source patch

Extract the `fitness-power-k40-patch.zip` contents into your existing source root (same level as `package.json`). Before overwriting, create a Git commit or branch. The patch is based on the last Fitness Power source archive supplied in this chat; if your GitHub version has other custom changes, review file diffs before replacing them.

```powershell
npm run typecheck
```

Then run the schema migration on a **Neon test branch** first:

```powershell
npm run db:push
```

Drizzle should propose **three new tables only**: `gym_devices`, `device_users`, `device_commands`. Review any destructive operations and STOP if it proposes dropping or overwriting existing tables.

No seed script is required; existing 277 website profiles remain intact.

## Step 2: Add website-only environment variables

Create a different random token from `BETTER_AUTH_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

In `.env.local` on the website project, add:

```dotenv
K40_AGENT_TOKEN="A_NEW_RANDOM_SECRET_64_OR_MORE_CHARACTERS"
K40_DEVICE_ID="gym-k40-01"
```

Add the **same two values** to **Vercel → Project Settings → Environment Variables → Production**, then redeploy. Do not prefix either variable with `NEXT_PUBLIC_`. Do not paste these secrets into chat or Git.

Your existing `DATABASE_URL`, Better Auth, and Cloudinary variables remain unchanged. The backend will never connect directly from Vercel to LAN IP `192.168.0.123`.

## Step 3: Install Python connector on a computer in the gym

Use the existing laptop that successfully connected via TCP 4370, or a dedicated always-on mini PC. Python 3.13 and `pyzk` worked before.

```powershell
cd device-connector
py -3.13 -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `device-connector/.env`:

```dotenv
SITE_URL="https://YOUR-DEPLOYED-FITNESS-POWER-DOMAIN"
K40_AGENT_TOKEN="SAME_NEW_RANDOM_SECRET_AS_VERCEL"
K40_DEVICE_ID="gym-k40-01"
K40_IP="192.168.0.123"
K40_PORT="4370"
K40_PASSWORD="0"
SYNC_SECONDS="120"
POLL_SECONDS="15"
ENABLE_K40_DELETIONS="false"
```

**Important:** `.env` here is the connector's private local file, separate from Next.js `.env.local`.

Run the **non-destructive** first synchronization:

```powershell
py -3.13 agent.py --once
```

It should print the number of device users received and imported. It does not create fingerprints or run delete commands.

Open your website `/fingerprint-devices` and `/members` (20 members per page). Confirm the K40 IDs were preserved and unmatched users have blank optional data. Total members will be the union of the website members and unique K40 accounts, **not 277 + 546 if many IDs overlap**.

Start the continuous agent:

```powershell
py -3.13 agent.py
```

For production, configure Task Scheduler or a Windows service wrapper to start the agent on computer boot/restart and run it while the laptop is logged out. A Windows PC must remain on at the gym to sync. No router port forwarding or inbound HTTP is necessary.

## Step 4: Normal new-member workflow (recommended)

1. On the physical K40, add the person, choose their numeric **User ID** and name, and enroll the fingerprint using its built-in menu.
2. Within about two minutes, the running connector will detect the account and create/link its web member profile using the same displayed ID.
3. Open **Members → Edit** and fill in phone, gender, plan (by Renew), photo, emergency contact, etc.
4. Verify the **Fingerprints Devices** listing shows both the correct K40 User ID and **UID**.

This is the **verified model** for user entry (because read-only K40 user export was already successful). Remote `enroll_user()` exists in pyzk, but enrollment-trigger behavior hasn't been tested on this specific K40; this patch intentionally does not issue remote enrollment or claim a scan popup will work.

**Website-first** is possible if you already know which numeric ID will be enrolled on the K40: create an ID+name-only website member, enroll the same User ID on the K40 manually, then let the agent link it. Avoid creating duplicate website profiles with a number already synchronized.

## Step 5: Website deletion that also deletes K40 account

**Destructive feature; keep disabled until tested with a disposable account.**

1. Create a disposable member on K40 and let it synchronize to the website.
2. Back up K40 user/attendance exports and confirm what will happen to the disposable fingerprint.
3. Set `ENABLE_K40_DELETIONS="true"` only in the **gym-side connector** `.env`, then restart `agent.py`.
4. In Members, owner/admin selects **Delete from website + K40** for that exact synced member.
5. Type the required confirmation `DELETE <K40_USER_ID>`.
6. Fitness Power archives the web member while retaining payments and historic data, then creates a queued device command.
7. The gym-side connector fetches the command and checks **both** `user_id` and `uid`, plus blocks device administrators.
8. It sends `delete_user()`, re-reads the device user list, and only then reports `succeeded`. See `/fingerprint-devices` for pending/failed/succeeded status.

If the connector is offline or deletions are not yet enabled, the command remains **pending**. It has **NOT** deleted the fingerprint. Do not assume website archiving means the machine acted.

Deletion cannot be undone automatically and this patch does not back up fingerprints. If the K40 cannot preserve templates, the person must enroll again after deletion.

## Step 6: Checks before going live

Run locally:

```powershell
npm run typecheck
npm run build
py -3.13 -m unittest discover -s device-connector -p test_agent.py
```

Verify in Neon **SQL Editor** (not PowerShell):

```sql
select count(*) as all_web_members from members where archived_at is null;
select count(*) as synced_device_accounts from device_users;
select count(*) as device_linked_members from device_users where member_id is not null and state = 'present';
select id, type, target_user_id, status, attempts, last_error from device_commands order by created_at desc limit 10;
```

Check at least five known legacy IDs and five machine-only IDs. Test K40 ID collisions and a device name differing from the edited website name. Do not remove actual historical records. Remove no sample records automatically.

**Not yet integrated:** attendance syncing, automatic membership expiry/suspension, remote fingerprint enrollment popup, fingerprint template backup/restore, K40 name changes on web edit. Those require separate firmware/device testing; no part of this patch pretends they are operational.

## Troubleshooting

- **K40 offline:** confirm gym computer on same router, K40 IP reserved and TCP 4370 reachable; run `py -3.13 agent.py --once`.
- **403/401 from Vercel:** confirm `K40_AGENT_TOKEN` is the same secret in Vercel and the local connector and `K40_DEVICE_ID` matches.
- **New machine users not listed:** verify `/fingerprint-devices` last inventory time and check connector errors; do not run `db:seed`.
- **Existing profile details replaced:** this should not happen: the importer updates the mapping, not the existing `members` profile. Stop connector and report before retrying.
- **Delete pending forever:** local `ENABLE_K40_DELETIONS` is false, computer is offline, or token/connection is invalid. This is intentionally safer than a silent deletion.
- **Delete failed:** inspect device command error and re-check User ID / UID against K40 before any retry. Do not reset the machine.
