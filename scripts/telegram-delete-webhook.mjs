import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  process.stderr.write('Missing TELEGRAM_BOT_TOKEN\n');
  process.exit(1);
}

const endpoint = `https://api.telegram.org/bot${token}/deleteWebhook`;
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ drop_pending_updates: false }),
});
const body = await response.json();
if (!response.ok || !body?.ok) {
  process.stderr.write(`Failed to delete webhook: ${JSON.stringify(body)}\n`);
  process.exit(1);
}
process.stdout.write('Webhook deleted\n');
