# Checkpoint · Backend

API Node.js / Express independiente. Requiere Node.js 22.12+ o 24.

```powershell
npm ci
Copy-Item .env.example .env
npm start
```

Configura Keycloak en `.env` si no está en localhost:8081. El frontend autorizado por defecto es http://localhost:5173.

| Método | Ruta | Autenticación |
| --- | --- | --- |
| GET | /health | Pública, comprobación de servicio |
| GET | /api/games | Bearer JWT válido |
| POST | /api/games | Bearer JWT válido |

Ejemplo de cuerpo POST:

```json
{"title":"Hollow Knight","platform":"PC","genre":"Indie","status":"Jugando","notes":"Mi favorito"}
```

El middleware usa `jose` y las claves JWKS de Keycloak para validar RS256, firma, emisor, audiencia, expiración y subject. Falta de Bearer o token inválido devuelve 401. Campos inválidos devuelven 400; alta exitosa, 201. Cada usuario obtiene sus propios elementos.

Los datos se guardan en `data/games.json`, ignorado por Git. Una escritura síncrona con reemplazo atómico conserva el listado tras reiniciar. Esta solución es para un proceso local; para múltiples instancias utiliza una base de datos transaccional compartida.

## Pruebas

```powershell
npm test
```

Las pruebas firman JWT con claves temporales y no requieren LDAP. Verifican GET/POST sin token, JWT inválido o vencido, firma ajena, claims, campos, alta/consulta, aislamiento de usuarios y persistencia. No sustituyen la prueba integral contra Keycloak real.
