const appUrl = process.env.APP_URL;
const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const upstashUrl = process.env.UPSTASH_REDIS_URL;
const upstashToken = process.env.UPSTASH_REDIS_TOKEN;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const adminIds = process.env.ADMIN_TELEGRAM_IDS;

const requiredEnvs = [
  ['APP_URL', appUrl],
  ['TELEGRAM_BOT_TOKEN', token],
  ['TELEGRAM_WEBHOOK_SECRET', webhookSecret],
  ['SUPABASE_URL', supabaseUrl],
  ['SUPABASE_SERVICE_ROLE_KEY', supabaseServiceRoleKey],
  ['UPSTASH_REDIS_URL', upstashUrl],
  ['UPSTASH_REDIS_TOKEN', upstashToken],
  ['ANTHROPIC_API_KEY', anthropicApiKey],
  ['ADMIN_TELEGRAM_IDS', adminIds],
];

const optionalEnvs = ['STRIPE_SECRET_KEY', 'GOOGLE_CLIENT_ID', 'RESEND_API_KEY'];

const missingRequired = requiredEnvs.filter(([, value]) => !value);
if (missingRequired.length > 0) {
  process.stderr.write(
    `Missing required envs: ${missingRequired.map(([key]) => key).join(', ')}\n`,
  );
  process.exit(1);
}

for (const key of optionalEnvs) {
  if (!process.env[key]) {
    process.stdout.write(`WARN: optional env missing (${key})\n`);
  }
}

function normalizeUrl(input) {
  return input.endsWith('/') ? input.slice(0, -1) : input;
}

async function checkJsonHealth(baseUrl) {
  const url = `${baseUrl}/health`;
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  const body = await response.json();
  if (body?.status !== 'ok') {
    throw new Error(`Unexpected /health payload: ${JSON.stringify(body)}`);
  }

  process.stdout.write(`PASS: /health status ok (${url})\n`);
}

async function checkAdminHealth(baseUrl) {
  const url = `${baseUrl}/admin/health`;
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`/admin/health failed with status ${response.status}`);
  }

  const body = await response.json();
  if (body?.status !== 'ok') {
    throw new Error(`Unexpected /admin/health payload: ${JSON.stringify(body)}`);
  }

  process.stdout.write(`PASS: /admin/health status ok (${url})\n`);
}

async function telegramApi(path, method = 'GET', body) {
  const url = `https://api.telegram.org/bot${token}/${path}`;
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok || !data?.ok) {
    throw new Error(`Telegram ${path} failed: ${JSON.stringify(data)}`);
  }
  return data.result;
}

async function checkTelegram() {
  const me = await telegramApi('getMe');
  process.stdout.write(`PASS: Telegram getMe ok (${me.username ?? 'unknown'})\n`);
  const webhook = await telegramApi('getWebhookInfo');
  process.stdout.write(`PASS: Telegram webhook info ok (url=${webhook.url || 'empty'})\n`);
}

async function checkSupabase() {
  const response = await fetch(`${supabaseUrl}/rest/v1/users?select=id&limit=1`, {
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase query failed with status ${response.status}`);
  }
  process.stdout.write('PASS: Supabase basic query ok\n');
}

async function checkRedis() {
  const response = await fetch(`${upstashUrl}/ping`, {
    headers: {
      Authorization: `Bearer ${upstashToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Redis ping failed with status ${response.status}`);
  }
  process.stdout.write('PASS: Redis ping ok\n');
}

async function main() {
  const baseUrl = normalizeUrl(appUrl);
  await checkJsonHealth(baseUrl);
  await checkAdminHealth(baseUrl);
  await checkTelegram();
  await checkSupabase();
  await checkRedis();
  process.stdout.write('Runtime verification passed.\n');
}

main().catch((error) => {
  process.stderr.write(`Runtime verification failed: ${String(error)}\n`);
  process.exit(1);
});
