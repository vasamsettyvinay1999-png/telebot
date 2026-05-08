import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;
const appUrl = process.env.APP_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !appUrl || !secret) {
  process.stderr.write(
    'Missing required envs: TELEGRAM_BOT_TOKEN, APP_URL, TELEGRAM_WEBHOOK_SECRET\n',
  );
  process.exit(1);
}

const base = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
const webhookUrl = `${base}/webhook/telegram`;
const endpoint = `https://api.telegram.org/bot${token}/setWebhook`;

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    drop_pending_updates: false,
  }),
});

const body = await response.json();
if (!response.ok || !body?.ok) {
  process.stderr.write(`Failed to set webhook: ${JSON.stringify(body)}\n`);
  process.exit(1);
}

process.stdout.write(`Webhook set to ${webhookUrl}\n`);
