const appUrl = process.env.APP_URL;

if (!appUrl) {
  process.stderr.write('APP_URL is required. Example: APP_URL=https://your-app.example.com\n');
  process.exit(1);
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

async function main() {
  const baseUrl = normalizeUrl(appUrl);
  await checkJsonHealth(baseUrl);
  await checkAdminHealth(baseUrl);
  process.stdout.write('Runtime verification passed.\n');
}

main().catch((error) => {
  process.stderr.write(`Runtime verification failed: ${String(error)}\n`);
  process.exit(1);
});
