import fs from 'node:fs/promises';

const checks = [
  {
    label: 'Telegram webhook secret validation',
    path: 'src/routes/webhook.route.ts',
    pattern: /TELEGRAM_WEBHOOK_SECRET|x-telegram-bot-api-secret-token/i,
  },
  {
    label: 'Stripe signature verification',
    path: 'src/routes/stripe.route.ts',
    pattern: /constructEvent|STRIPE_WEBHOOK_SECRET/i,
  },
  {
    label: 'Service role key usage',
    path: 'src/config/supabase.ts',
    pattern: /SUPABASE_SERVICE_ROLE_KEY/i,
  },
  {
    label: 'Upload magic-byte validation',
    path: 'src/utils/fileValidator.ts',
    pattern: /magic|signature|isLikelyDocx/i,
  },
  {
    label: 'Replay protection check',
    path: 'src/routes/webhook.route.ts',
    pattern: /replay|update_id|extractUpdateId/i,
  },
  {
    label: 'Error masking in HTTP responses',
    path: 'src/server.ts',
    pattern: /Internal Server Error/i,
  },
];

let failed = false;
for (const check of checks) {
  try {
    const content = await fs.readFile(check.path, 'utf8');
    const ok = check.pattern.test(content);
    if (!ok) {
      failed = true;
      process.stdout.write(`FAIL: ${check.label} (${check.path})\n`);
    } else {
      process.stdout.write(`PASS: ${check.label}\n`);
    }
  } catch (error) {
    failed = true;
    process.stdout.write(`FAIL: ${check.label} (${check.path})\n`);
    process.stdout.write(`  ${String(error)}\n`);
  }
}

if (failed) {
  process.stderr.write('Security audit checks failed.\n');
  process.exit(1);
}

process.stdout.write('Security audit checks passed.\n');
