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
