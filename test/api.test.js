import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { createApp } from '../src/app.js';

test('API: autenticación, validación, persistencia y aislamiento por usuario', async t => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const dir = mkdtempSync(join(tmpdir(), 'checkpoint-test-'));
  const config = { keySet: publicKey, issuer: 'https://test.local', audience: 'fastapi-api', dataFile: join(dir, 'games.json') };
  const server = createApp(config).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = async (overrides = {}, key = privateKey) => new SignJWT({ sub: 'alice', iss: config.issuer, aud: config.audience, exp: Math.floor(Date.now() / 1000) + 300, ...overrides }).setProtectedHeader({ alg: 'RS256' }).sign(key);
  const validToken = await token();
  const request = (method = 'GET', bearer, body) => fetch(`${base}/api/games`, { method, headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  await t.test('GET y POST sin token devuelven 401', async () => { for (const method of ['GET', 'POST']) assert.equal((await request(method)).status, 401); });
  await t.test('rechaza token malformado, expirado, emisor/audiencia erróneos y sin claims', async () => {
    for (const bad of ['invalid', await token({ exp: 1 }), await token({ iss: 'otro' }), await token({ aud: 'otro' }), await token({ sub: undefined }), await token({ exp: undefined })]) {
      for (const method of ['GET', 'POST']) assert.equal((await request(method, bad)).status, 401);
    }
  });
  await t.test('rechaza una firma ajena', async () => { const other = await generateKeyPair('RS256'); assert.equal((await request('GET', await token({}, other.privateKey))).status, 401); });
  await t.test('valida los campos antes de guardar', async () => { assert.equal((await request('POST', validToken, { title: ' ' })).status, 400); });
  await t.test('guarda y recupera el elemento con JWT válido', async () => {
    const response = await request('POST', validToken, { title: 'Hollow Knight', platform: 'PC', genre: 'Indie', status: 'Jugando', notes: 'Mi favorito' });
    assert.equal(response.status, 201);
    const game = await response.json(); assert.ok(game.id); assert.equal(game.owner, undefined);
    const list = await (await request('GET', validToken)).json(); assert.equal(list.length, 1); assert.equal(list[0].title, 'Hollow Knight');
  });
  await t.test('otro usuario no recibe la colección de Alice', async () => { assert.deepEqual(await (await request('GET', await token({ sub: 'bob' }))).json(), []); });
  await t.test('la colección persiste al recrear la aplicación', async () => {
    const second = createApp(config).listen(0); await new Promise(resolve => second.once('listening', resolve));
    try { const response = await fetch(`http://127.0.0.1:${second.address().port}/api/games`, { headers: { Authorization: `Bearer ${validToken}` } }); assert.equal((await response.json()).length, 1); }
    finally { await new Promise(resolve => second.close(resolve)); }
  });
});
