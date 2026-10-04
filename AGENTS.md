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
- App data is read client-side via the browser data client + TanStack Query options in `src/lib/data.ts`; all pages live under the `_authenticated` layout — keeps one cached dataset so search/filters/stats update instantly.
- Exam results live on the exam row; a DB trigger appends every non-pending result change to the results history table — history is never overwritten.
- Official SVP result lookup goes only through `src/lib/svp.functions.ts`; manual non-SVP lookup remains isolated in `src/lib/result-checker.ts` — prevents duplicate external-result implementations.
- TS strictness flags noUncheckedIndexedAccess/exactOptionalPropertyTypes/noImplicitReturns/noPropertyAccessFromIndexSignature are off — they conflict with recharts/shadcn typings and add noise.
- Customer login is mobile number + password on /auth, signing in with a synthetic email `88<mobile>@phone.login.local`; no OTP in the login flow — phone provider unavailable, so phone maps to email credentials.
- Customers (no user_roles row) land on /portal, which reads only their own candidate/exams via RLS matching the login mobile; staff-table policies use is_staff(). Management pages (_authenticated) require a user_roles row (admin/staff); admins sign in at /admin/login with email/password — keeps phone-OTP customers out of the dashboard.
- SVP (Saudi Skill Verification) result lookup runs server-side in `src/lib/svp.functions.ts` (staff-only), nationality fixed to Bangladesh (BGD); results update the exam row so history trigger logs it.
- Applicant result visibility is gated by candidates.result_check_at and served publicly only via the SECURITY DEFINER RPC check_applicant_result (passport + occupation) — exposes one matching record, never the table.
- Roles: admin/staff oversee all pages; agent → /dashboard + /submit-job + /my-works; service_provider → /provider; management → /management reception; no role = customer /portal. Managed-account details + active flags live in agent_accounts, and every role is server/RLS enforced.
- Approved submissions are the workflow source: database triggers link them to candidate/exam records and synchronize SVP results to the exam history, while the management role only handles reception details — keeps every role on one authoritative record.
