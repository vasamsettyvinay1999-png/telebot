## Security Audit Checklist

- Verify webhook secret token validation for Telegram routes.
- Verify Stripe signature validation for webhook route.
- Verify service role key only used on backend.
- Confirm no anon key usage in server runtime.
- Confirm sensitive log redaction includes tokens and message text.
- Confirm upload validation uses magic bytes (not extension).
- Confirm per-user and global rate limits are enforced.
- Confirm replay protection for Telegram update IDs.
- Confirm no stack traces leaked in HTTP responses.

