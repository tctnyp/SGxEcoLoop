import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChildProcess, spawn } from 'node:child_process';
import { after, before, describe, it } from 'node:test';

const testRoot = await mkdtemp(join(tmpdir(), 'novo-session-'));
const databasePath = join(testRoot, 'sessions.sqlite');
const port = 42_000 + (process.pid % 1_000);
const baseUrl = `http://127.0.0.1:${port}`;
let server: ChildProcess | null = null;

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The child is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the persistence test server.');
}

async function startServer() {
  server = spawn(process.execPath, ['dist/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NOVO_DB_PATH: databasePath, NOVO_ADMIN_EMAIL: 'persistent-admin@example.com', NOVO_BOOTSTRAP_PASSWORD: 'password' },
    stdio: 'ignore',
  });
  await waitForServer();
}

async function stopServer() {
  const active = server;
  server = null;
  if (!active || active.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => active.once('exit', () => resolve()));
  active.kill();
  await exited;
}

async function jsonRequest(path: string, init?: RequestInit) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
}

before(startServer);
after(async () => {
  await stopServer();
  await rm(testRoot, { recursive: true, force: true });
});

describe('persistent authentication sessions', () => {
  it('restores member and administrator sessions after a server restart and persists revocation', { timeout: 20_000 }, async () => {
    const memberSignUp = await jsonRequest('/api/auth/onboarding', {
      method: 'POST',
      body: JSON.stringify({ name: 'Persistent Member', email: 'persistent-member@example.com', password: 'Password1!', mascotName: 'Sprout', focus: 'repair' }),
    });
    assert.equal(memberSignUp.status, 201);
    const memberToken = String((await memberSignUp.json() as { token: string }).token);

    const adminSignIn = await jsonRequest('/api/auth/web-sign-in', {
      method: 'POST',
      body: JSON.stringify({ email: 'persistent-admin@example.com', password: 'password' }),
    });
    assert.equal(adminSignIn.status, 200);
    const adminToken = String((await adminSignIn.json() as { token: string }).token);

    await stopServer();
    await startServer();

    const restoredMember = await jsonRequest('/api/auth/mobile-session', { headers: { Authorization: `Bearer ${memberToken}` } });
    const restoredAdmin = await jsonRequest('/api/auth/session', { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(restoredMember.status, 200);
    assert.equal(restoredAdmin.status, 200);

    assert.equal((await jsonRequest('/api/auth/sign-out', { method: 'POST', headers: { Authorization: `Bearer ${memberToken}` } })).status, 204);
    assert.equal((await jsonRequest('/api/auth/sign-out', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } })).status, 204);

    await stopServer();
    await startServer();

    assert.equal((await jsonRequest('/api/auth/mobile-session', { headers: { Authorization: `Bearer ${memberToken}` } })).status, 401);
    assert.equal((await jsonRequest('/api/auth/session', { headers: { Authorization: `Bearer ${adminToken}` } })).status, 401);
  });
});
