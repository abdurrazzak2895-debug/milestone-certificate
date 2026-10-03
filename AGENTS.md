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
- Official result lookup goes only through `src/lib/result-checker.ts` — a single seam to plug an authorized API later.
- TS strictness flags noUncheckedIndexedAccess/exactOptionalPropertyTypes/noImplicitReturns/noPropertyAccessFromIndexSignature are off — they conflict with recharts/shadcn typings and add noise.
- Customer login is mobile number + password on /auth, signing in with a synthetic email `88<mobile>@phone.login.local`; no OTP in the login flow — phone provider unavailable, so phone maps to email credentials.
- Management pages (_authenticated) require a user_roles row (admin/staff); admins sign in at /admin/login with email/password — keeps phone-OTP customers out of the dashboard.
