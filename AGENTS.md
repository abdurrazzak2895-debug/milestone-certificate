<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Managed-account avatars use the existing private candidate-photos path candidate-drafts/<userId>/agent-profile.jpg; admin uploads and owner uploads share it so every authorized view resolves the same image.
- App data is read client-side via the browser data client + TanStack Query options in `src/lib/data.ts`; all pages live under the `_authenticated` layout — keeps one cached dataset so search/filters/stats update instantly.
- Exam results live on the exam row; a DB trigger appends every non-pending result change to the results history table — history is never overwritten.
- Official SVP result lookup goes only through `src/lib/svp.functions.ts`; manual non-SVP lookup remains isolated in `src/lib/result-checker.ts` — prevents duplicate external-result implementations.
- TS strictness flags noUncheckedIndexedAccess/exactOptionalPropertyTypes/noImplicitReturns/noPropertyAccessFromIndexSignature are off — they conflict with recharts/shadcn typings and add noise.
- Customer login is mobile number + password on /auth, signing in with a synthetic email `88<mobile>@phone.login.local`; no OTP in the login flow — phone provider unavailable, so phone maps to email credentials.
- Customers (no user_roles row) land on /portal, which reads only their own candidate/exams via RLS matching the login mobile; staff-table policies use is_staff(). Most management pages (_authenticated) require admin/staff; the Takamol availability page and SVP booking workspace also allow agents, with agent booking rows limited to records created by that agent. Admins sign in at /admin/login with email/password — keeps phone-OTP customers out of the dashboard.
- SVP (Saudi Skill Verification) result lookup runs server-side in `src/lib/svp.functions.ts` (staff-only), nationality fixed to Bangladesh (BGD); results update the exam row so history trigger logs it.
- Applicant result visibility is gated by candidates.result_check_at and served publicly only via the SECURITY DEFINER RPC check_applicant_result (passport + occupation) — exposes one matching record, never the table.
- Roles: admin/staff oversee all management pages; agent → /dashboard + /submit-job + /my-works + read-only /takamol availability + own-record /svp-booking; service_provider → /provider; management → /management reception; no role = customer /portal. Managed-account details + active flags live in agent_accounts, and every role is server/RLS enforced.
- Approved submissions are the workflow source: database triggers link them to candidate/exam records and synchronize SVP results to the exam history, while the management role only handles reception details — keeps every role on one authoritative record.
- "Reception + Agent" accounts are stored as two user_roles rows (management + agent) with agent_accounts.role=management — reuses existing per-role RLS and routing instead of a new role.
- Device + 12h login is enforced via `src/lib/device-session.ts` against `device_sessions` through SECURITY DEFINER RPCs claim/is_current_device_session; admins keep the latest two device keys (session_key + prev_session_key), other roles one — newest login wins, oldest is signed out on next check.
- Sub-agents are agent accounts with agent_accounts.parent_agent_id; their submissions start as status pending_agent (set by insert trigger), visible only to parent agent and admin until the parent approves into pending_approval — reuses the normal agent workflow and RLS.
- Admin messaging: recipient selection and template rendering live in src/lib/messaging.ts (shared by preview and sender); sending goes through a sms_messages queue with unique dedupe_key, processed by admin server fns and an hourly cron route — one sender path, no duplicate SMS.
- The /svp-booking workspace has two independent parts: `SvpManualRecordPanel` writes the `svp_bookings` local tracker (candidate name + passport always required, `draft` allowed before appointment details; agents see only their own rows via RLS) and `SvpLoginPanel` runs the real SVP login (`src/lib/svp-session.functions.ts` → `/sessions/login`, then `/sessions/otp`). `fe_app`/`otp_method`/`locale` stay server-managed, and responses reach the browser only as `readSvpSessionResult` messages with credentials redacted and tokens never returned.
