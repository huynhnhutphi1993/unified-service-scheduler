import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';

const base = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api').replace(
  /\/$/,
  '',
);

async function call(method, path, { token, key, body, expected = 200 } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (response.status !== expected)
    throw new Error(
      `${method} ${path.split('?')[0]} returned ${response.status} (${result.code ?? 'unexpected response'})`,
    );
  console.log(`${method} ${path.split('?')[0]} -> ${response.status}`);
  return result;
}

async function main() {
  const login = await call('POST', '/auth/login', {
    body: {
      username: 'customer.a',
      password: process.env.SEED_CUSTOMER_A_PASSWORD,
    },
  });
  const token = login.accessToken;
  const catalog = await call('GET', '/catalog', { token });
  const dealer = catalog.dealerships[0];
  const service =
    catalog.services.find((entry) => entry.name === 'Oil change') ??
    catalog.services[0];
  const vehicle = catalog.vehicles[0];
  if (!dealer || !service || !vehicle)
    throw new Error('Run the database and account seeds first.');
  let request;
  for (let days = 1; days <= 14; days++) {
    const day = DateTime.now()
      .setZone(dealer.timeZone)
      .plus({ days })
      .startOf('day');
    const hours = dealer.openingHours.find(
      (entry) => entry.dayOfWeek === day.weekday,
    );
    if (!hours) continue;
    const [hour, minute] = hours.opensAt.split(':').map(Number);
    const candidate = {
      dealershipId: dealer.id,
      vehicleId: vehicle.id,
      serviceId: service.id,
      startsAt: day.set({ hour, minute }).toISO(),
    };
    const availability = await call(
      'GET',
      `/availability?${new URLSearchParams(candidate)}`,
      { token },
    );
    if (availability.available) {
      request = candidate;
      break;
    }
  }
  if (!request)
    throw new Error('No demonstration slot available in the next two weeks.');

  const key = randomUUID();
  const appointment = await call('POST', '/appointments', {
    token,
    key,
    body: request,
    expected: 201,
  });
  const replay = await call('POST', '/appointments', {
    token,
    key,
    body: request,
  });
  if (replay.id !== appointment.id)
    throw new Error('Idempotency invariant failed.');
  await call('GET', `/appointments/${appointment.id}`, { token });
  const otherLogin = await call('POST', '/auth/login', {
    body: {
      username: 'customer.b',
      password: process.env.SEED_CUSTOMER_B_PASSWORD,
    },
  });
  await call('GET', `/appointments/${appointment.id}`, {
    token: otherLogin.accessToken,
    expected: 404,
  });
  await call('POST', `/appointments/${appointment.id}/cancel`, {
    token,
    body: { reason: 'Demonstration complete' },
  });
  const cancelledReplay = await call('POST', '/appointments', {
    token,
    key,
    body: request,
  });
  if (cancelledReplay.status !== 'CANCELLED')
    throw new Error('Cancellation replay invariant failed.');
  const replacement = await call('POST', '/appointments', {
    token,
    key: randomUUID(),
    body: request,
    expected: 201,
  });
  await call('POST', `/appointments/${replacement.id}/cancel`, {
    token,
    body: { reason: 'Release demo resources' },
  });
  console.log(
    `Demo passed. Appointment ${appointment.id} and replacement ${replacement.id} remain in history as CANCELLED.`,
  );
}

try {
  await main();
} catch (error) {
  console.error(`Demo failed: ${error.message}`);
  process.exitCode = 1;
}
