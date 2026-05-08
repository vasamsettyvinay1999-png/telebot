import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  process.stderr.write('Missing TELEGRAM_BOT_TOKEN\n');
  process.exit(1);
}

const endpoint = `https://api.telegram.org/bot${token}/getWebhookInfo`;
const response = await fetch(endpoint);
const body = await response.json();
if (!response.ok || !body?.ok) {
  process.stderr.write(`Failed to fetch webhook info: ${JSON.stringify(body)}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify(body.result, null, 2)}\n`);
