# Vercel and Supabase setup

## Supabase

1. Create a Supabase project.
2. Run the SQL files in `supabase/migrations` in filename order through the Supabase SQL editor or Supabase CLI.
3. In Authentication > Providers, enable Google.
4. Disable email, phone, and any other providers if accounts must be Google-only.
5. Add these redirect URLs in Supabase Authentication > URL Configuration:
   - `http://localhost:3000`
   - your Vercel production URL
   - any Vercel preview URL pattern you use

## Vercel

Set these environment variables in Vercel:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_GCASH_ACCOUNT_NAME=Your GCash Name
VITE_GCASH_ACCOUNT_NUMBER=09XX XXX XXXX
VITE_GCASH_QR_IMAGE_URL=/gcash-qr.png
VITE_BANK_NAME=Your Bank
VITE_BANK_ACCOUNT_NAME=Your Account Name
VITE_BANK_ACCOUNT_NUMBER=0000 0000 0000
```

Vercel will use `vercel.json`, run `pnpm build`, publish `dist/public`, and rewrite routes back to `index.html` for the Vite app.

## Manual Payments

Manual checkout creates a pending Supabase order first. Customers then choose GCash QR or bank transfer and submit their payment reference number. Treat that submission as a review queue: verify the amount and reference number in your GCash or bank app before marking the order `paid` through a trusted admin workflow.

For now, marking an order paid should be done from the Supabase dashboard or another service-role-only admin tool:

```sql
update public.orders
set status = 'paid'
where order_number = 'UC-EXAMPLE';
```

## Roles

Recommended roles for this store:

- `customer`: default for every Google sign-in. Can manage their own account and later view orders.
- `staff`: fulfillment and catalog support. Useful once you add order handling or inventory edits.
- `admin`: owner/operator access for role changes, store settings, and sensitive actions.

Keep role changes out of the browser. Use a Supabase service-role script, dashboard SQL, or a protected server function for promotions.
