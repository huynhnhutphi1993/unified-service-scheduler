import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const lines = createInterface({
  input: process.argv[2] ? createReadStream(process.argv[2]) : process.stdin,
});
const outcomes = new Map();
const latencies = [];
for await (const line of lines) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }
  const event = typeof entry.message === 'object' ? entry.message : entry;
  if (event.event !== 'http_request') continue;
  const key = `${event.method} ${event.route} ${event.status} ${event.code}`;
  outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
  if (typeof event.durationMs === 'number') latencies.push(event.durationMs);
}
latencies.sort((a, b) => a - b);
const percentile = (fraction) =>
  latencies.length
    ? latencies[Math.max(0, Math.ceil(latencies.length * fraction) - 1)]
    : null;
console.log(
  JSON.stringify(
    {
      requests: latencies.length,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      outcomes: Object.fromEntries(outcomes),
    },
    null,
    2,
  ),
);
