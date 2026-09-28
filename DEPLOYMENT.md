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
VITE_PAYPAL_LINK=https://paypal.me/yourhandle
```

Vercel will use `vercel.json`, run `pnpm build`, publish `dist/public`, and rewrite routes back to `index.html` for the Vite app.

## Manual Payments

Manual checkout creates a pending Supabase order first. Customers then choose GCash QR, bank transfer, or PayPal, and submit their payment reference number. Treat that submission as a review queue: verify the amount and reference number in your GCash, bank, or PayPal account before marking the order `paid` through a trusted admin workflow.

PayPal is a link, not an integration. The customer is sent to your own PayPal page and types the resulting transaction id into the same reference box, so verification is exactly as manual as the other two methods. Set `VITE_PAYPAL_LINK` to your `paypal.me` address, a PayPal Business payment link, or an invoice URL. Leaving it empty is safe: the checkout tells the customer PayPal is not set up instead of rendering a broken link. No PayPal API keys are needed anywhere in this project.

The order of those steps matters: apply `supabase/migrations/20260928006000_add_paypal_payment_method.sql` before deploying, because the database enum is what makes a PayPal submission recordable. If the UI ships first, selecting PayPal fails at the database.

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
