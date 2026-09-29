import express from 'express';
import cors from 'cors';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createApp({ keySet, issuer = process.env.JWT_ISSUER || 'http://localhost:8081/realms/cybersecurity', audience = process.env.JWT_AUDIENCE || 'fastapi-api', dataFile = process.env.DATA_FILE || './data/games.json' } = {}) {
  const app = express();
  const file = resolve(dataFile);
  mkdirSync(dirname(file), { recursive: true });
  const keys = keySet || createRemoteJWKSet(new URL(process.env.JWKS_URL || `${issuer}/protocol/openid-connect/certs`));
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173', allowedHeaders: ['Authorization', 'Content-Type'] }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
    if (!match) return res.status(401).set('WWW-Authenticate', 'Bearer').json({ message: 'Falta un Bearer Token válido.' });
    try {
      const { payload } = await jwtVerify(match[1], keys, { issuer, audience, algorithms: ['RS256'], requiredClaims: ['sub', 'exp'] });
      req.user = payload;
      console.info(`[JWT] ${req.method} ${req.originalUrl}: Bearer presente; firma válida; usuario=${payload.sub}`);
      next();
    } catch {
      res.status(401).set('WWW-Authenticate', 'Bearer').json({ message: 'Token inválido o expirado. Inicia sesión de nuevo.' });
    }
  });
  const readGames = () => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  app.get('/api/games', (req, res) => res.json(readGames().filter(game => game.owner === req.user.sub).map(({ owner, ...game }) => game)));
  app.post('/api/games', (req, res) => {
    const { title, platform, genre, status, notes = '' } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 100 ||
      !['PC', 'PlayStation', 'Xbox', 'Nintendo Switch', 'Móvil'].includes(platform) ||
      !['Aventura', 'RPG', 'Acción', 'Estrategia', 'Deportes', 'Indie', 'Otro'].includes(genre) ||
      !['Por jugar', 'Jugando', 'Completado'].includes(status) || typeof notes !== 'string' || notes.length > 500) {
      return res.status(400).json({ message: 'Revisa el título, la plataforma, el género, el estado y las notas.' });
    }
    const game = { id: randomUUID(), title: title.trim(), platform, genre, status, notes: notes.trim(), createdAt: new Date().toISOString(), owner: req.user.sub };
    const games = readGames();
    games.unshift(game);
    // Single-process storage: synchronous update + atomic rename prevents partial writes.
    writeFileSync(`${file}.tmp`, JSON.stringify(games, null, 2));
    renameSync(`${file}.tmp`, file);
    const { owner, ...publicGame } = game;
    res.status(201).json(publicGame);
  });
  app.use((err, _req, res, _next) => {
    console.error(err.message);
    res.status(err.status === 400 ? 400 : 500).json({ message: err.status === 400 ? 'JSON inválido.' : 'No fue posible completar la operación.' });
  });
  return app;
}
