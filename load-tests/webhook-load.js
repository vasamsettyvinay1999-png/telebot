import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '30s',
};

export default function () {
  const payload = JSON.stringify({
    update_id: Date.now(),
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 1, type: 'private' },
      from: { id: 1, is_bot: false, first_name: 'Load' },
      text: 'load test ping',
    },
  });

  const url = `${__ENV.BASE_URL}/webhook/${__ENV.TELEGRAM_WEBHOOK_SECRET}`;
  const res = http.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
  check(res, {
    'status 200': (r) => r.status === 200,
  });
  sleep(1);
}

