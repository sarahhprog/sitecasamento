# Supabase setup

1. Apply `migrations/20260927230000_admin_and_wedding_data.sql` in the Supabase SQL Editor.
2. Add the project URL and publishable/anon key to `casamento/.env.local`:

   ```text
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
   ```

   `.env.local` is ignored by Git. Never use a service-role key in this Vite app.
3. In Supabase Authentication, set the site URL and allowed redirect URLs for the deployed site, `/admin/login`, and `/admin/redefinir-senha`. Configure email confirmation and SMTP for production password recovery.
4. Create an account at `/admin/cadastro` and confirm its email.
5. Promote the first administrator in the SQL Editor, replacing the address:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'admin@example.com');
   ```

   Public registration creates only a regular user. It cannot grant administrator access. Additional admin promotions must be performed by an existing administrator or by a trusted operator in Supabase.
6. Restart the Vite development server after changing `.env.local`.

The migration enables row-level security on wedding data, keeps guest and RSVP tables private, exposes only available-to-publish gift fields to the public role, limits public guest lookup to a single exact name/code match, and creates the `wedding-assets` bucket for administrator uploads.

Gift and gallery files allow JPG, JPEG, PNG, WEBP, and PDF up to 10 MB. Only administrators can upload or delete files. Public RSVP and messages use narrowly scoped database functions/policies; the public app never reads the guest table.

## Gift payments

1. Apply `migrations/20261003100000_gift_payments.sql` after the existing wedding-data migration. It creates a private payment ledger. The public anon role has no access; authenticated reads require `public.is_wedding_admin()`, while server functions use the service-role key.
2. Apply `migrations/20261013140000_grant_payment_api_gift_read.sql`. It grants `service_role` read access only to the gift columns used to create a checkout; it does not change public or administrator access.
3. Apply `migrations/20261013150000_gift_reservations.sql`. It adds temporary gift reservations and confirmed-gift fields, backfills gifts with existing approved payments, and creates the serialized service-role functions used by the card checkout and webhook.
4. Apply `migrations/20261014100000_manual_pix_and_gift_controls.sql`. It adds a PIX payment method, a 24-hour temporary reservation for manual PIX, administrator-only review and availability functions, private PIX settings, and an administrator-readable event history. The migration is additive and preserves existing payment records. PIX settings are edited in **Admin > Localização e Informações**; leave the key blank until it is configured. The recipient name defaults to Hayato Miyata Rocha.
5. Configure these variables in the serverless deployment environment (and in the local Vercel Functions environment when testing). `SUPABASE_SERVICE_ROLE_KEY` must be the project's server-only service-role JWT or a Supabase secret key, never the publishable/anon key:
   - `SUPABASE_URL` (or reuse the existing `VITE_SUPABASE_URL` server-side)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MERCADOPAGO_ACCESS_TOKEN`
   - `MERCADOPAGO_WEBHOOK_SECRET`
   - `SITE_URL` as the absolute site origin, for example `https://example.com` (when omitted, Production prefers `VERCEL_PROJECT_PRODUCTION_URL`; other environments fall back to `VERCEL_URL`)
6. Keep `SUPABASE_SERVICE_ROLE_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, and `MERCADOPAGO_WEBHOOK_SECRET` server-only. Never prefix them with `VITE_`, add them to frontend code, or expose them in logs. If a credential has ever been exposed, revoke and rotate it before enabling payments.
7. In Mercado Pago developer settings, configure a webhook for payment events pointing to `https://YOUR_SITE/api/mercado-pago/webhook`. Copy that webhook's signing secret into `MERCADOPAGO_WEBHOOK_SECRET`. The endpoint verifies `x-signature`, retrieves the payment using the authenticated SDK, then calls the atomic database function that updates payment and gift state together.
8. `npm run dev` starts Vite only and does not serve the `/api` functions. For local full-flow testing, run `npx vercel dev` from the `casamento` project directory with the required server variables configured locally. Do not use production credentials for local or preview testing.
9. Run the deterministic validation suite from the project directory with `npm test`. For an end-to-end check, use a Mercado Pago test access token and a preview Supabase project, create test gifts around R$ 99,99, R$ 100,00, R$ 249,99, and R$ 250,00, then test valid and invalid names/messages, an approved payment, a pending payment, and a rejected/cancelled/expired payment. Confirm the webhook updates the admin-only `Pagamentos` table and that the return page reports success only after the server-side status becomes `approved`.

The browser sends only the gift ID, guest name, optional message, and a random idempotency key. The server reserves the gift and creates the payment ledger row in one database transaction; the database reads the authoritative gift name and price. Card preferences expire with their 30-minute reservation. Manual PIX requests use a 24-hour maximum reservation, including while awaiting administrator review; a guest's “Já fiz o pagamento” action only submits a review request. Administrators must verify the transfer and confirm or reject it from the existing **Pagamentos** area. Administrative gift availability changes use database functions, are audited, preserve the payment ledger, and reject active reservations. Expired reservations are released on the next relevant server operation and are also treated as expired by the public status endpoint; there is no scheduled cleanup job, so stale ledger rows remain for history. The public list refreshes periodically. The public status endpoint returns only a payment status for that random reference; guest names and messages are never returned to it. Repeated requests with the same key reuse the same reservation, and delayed card webhooks cannot overwrite a manual availability decision or a different active reservation.
