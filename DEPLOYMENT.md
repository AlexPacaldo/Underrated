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
VITE_PAYPAL_LINK=https://paypal.me/yourhandle
```

Vercel will use `vercel.json`, run `pnpm build`, publish `dist/public`, and rewrite routes back to `index.html` for the Vite app.

## PayPal Payments

Manual checkout creates a pending Supabase order first. Customers pay through the store's PayPal link and submit their PayPal transaction ID. Treat submissions as a review queue: verify the amount and transaction ID in PayPal before marking the order `paid` through a trusted admin workflow.

PayPal is a link, not an integration. Set `VITE_PAYPAL_LINK` to your `paypal.me` address, a PayPal Business payment link, or an invoice URL. Leaving it empty is safe: checkout explains that PayPal is not configured and disables transaction submission. No PayPal API keys are needed anywhere in this project.

Apply migrations in filename order, including `20260928006000_add_paypal_payment_method.sql` and `20261104000000_paypal_only.sql`. The latter keeps the legacy enum values so old order history remains readable, but rejects new GCash and bank transfer submissions at the database.

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
