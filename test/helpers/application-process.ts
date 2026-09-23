import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';

export interface ApplicationProcess {
  url: string;
  logs: string[];
  stop(): Promise<void>;
}

export async function startApplication(
  databaseUrl: string,
): Promise<ApplicationProcess> {
  const logs: string[] = [];
  const child: ChildProcess = fork(resolve('dist/main.js'), [], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: '0',
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    execArgv: [],
  });
  child.stdout?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
  const port = await new Promise<number>((resolvePort, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Application did not start within 15 seconds.'));
    }, 15_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Application exited during startup (${code}). ${logs.join('')}`,
        ),
      );
    });
    child.on('message', (message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'ready' &&
        'port' in message &&
        typeof message.port === 'number'
      ) {
        clearTimeout(timer);
        resolvePort(message.port);
      }
    });
  });
  return {
    url: `http://127.0.0.1:${port}/api`,
    logs,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 5_000);
      await exited;
      clearTimeout(force);
    },
  };
}

export async function api(
  app: ApplicationProcess,
  path: string,
  options: {
    method?: string;
    token?: string;
    key?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.key) headers['Idempotency-Key'] = options.key;
  if (options.body !== undefined)
    headers['Content-Type'] ??= 'application/json';
  const response = await fetch(`${app.url}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json()) as Record<string, any>,
  };
}
