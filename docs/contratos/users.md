# Contrato de Servicio: users-service (Tema 01 — Identidad y Usuarios)

> Grupo 10 · Mock Stack `tpi-roadmap-mocks`  
> Documento de fidelidad contractual según regla R2 / R14 de `IMPLEMENTACION.md`.

## 1. Identidad y Metadatos de Infraestructura

- **Nombre en Eureka:** `users-service`
- **Puerto interno:** `8082`
- **Prefijo en API Gateway:** `/api/users/**`
- **Autenticación Frontend:** Cookies HttpOnly `fu_at` (Access Token) y `fu_rt` (Refresh Token)
- **Token Mock Formato:** `mock.<base64url(JSON)>`
  - Usuario: `{ type: "user", sub: "<uuid>", roles: ["<ROL>"] }`
  - Servicio: `{ type: "service", sub: "<clientId>", scopes: ["<scope>"] }`

---

## 2. Fuentes Contractuales Analizadas

1. **Microservicio Real (`_integracion/tpi-users`):**
   - Repositorio: `Backend/_integracion/tpi-users` @ `da665a51cbd3a746dd3de56c24e508c4568c244b`
   - `AuthController.java:100` (`POST /api/users/public/auth/login`)
   - `AuthController.java:126` (`POST /api/users/public/auth/2fa/verify`)
   - `AuthController.java:156` (`POST /api/users/public/auth/refresh`)
   - `AuthPrivateController.java:85` (`POST /api/users/auth/logout`)
   - `UserController.java:72` (`GET /api/users/me`)
   - `UserController.java:95` (`PATCH /api/users/me/onboarding`)
   - `UserController.java:132` (`GET /api/users/profile/{id}`)
   - `UserController.java:149` (`GET /api/users`)
   - `PublicLegalController.java:24` (`GET /api/users/public/legal/terms`)
   - `TokenController.java` (`POST /api/users/public/auth/token`)

2. **Frontend Angular (`Frontend/2026-PIV-TPI-FE`):**
   - Repositorio: `Frontend/2026-PIV-TPI-FE` @ `origin/develop` (`f70c508f8a7e1758a3b6c2486729a0ba8fd42c71`)
   - `src/app/core/models/auth.model.ts:1-120` (`Role`, `AccountStatus`, `LoginRequest`, `LoginChallengeResponse`, `Verify2faRequest`, `SessionResponse`, `MeResponse`, `PublicProfile`, `OnboardingRequest`, `TermsOfService`)
   - `src/app/core/auth/auth.service.ts:69-255` (Llamadas a `login`, `verify2fa`, `refresh`, `logout`, `restoreSession`, `me`, `patchOnboarding`, `terms`)
   - `src/app/core/config/api.config.ts:22-53` (Rutas relativas de autenticación, usuarios y perfiles)

3. **Consumidor Roadmap (`Backend/tpi-roadmap`):**
   - Repositorio: `Backend/tpi-roadmap` @ `develop` (`02c14b9ba633d3610b9c90d696c84db32253cf80`)
   - `HttpTechnicalTokenProvider.java:90-160`: Adquisición de tokens técnicos M2M vía Gateway mediante `POST /api/users/public/auth/token`.
   - `TokenRequest(clientId, clientSecret, grantType: "client_credentials", scope, audience)`
   - `TokenResponse(accessToken, tokenType: "bearer", expiresIn: Long)`

---

## 3. Endpoints Expuestos

| Método | Path | Request Body / Query | Response Body | Status | Rol / Contexto |
|---|---|---|---|---|---|
| `POST` | `/api/users/public/auth/login` | `{ email, password }` | `{ challengeId, message }` | 200 / 401 | Público. Inicia flujo 2FA. Acepta cualquier password para usuarios registrados. |
| `POST` | `/api/users/public/auth/2fa/verify` | `{ challengeId, code }` | `{ expiresIn: 3600 }` + `Set-Cookie: fu_at, fu_rt` | 200 / 401 | Público. Acepta cualquier código y emite cookies `fu_at` y `fu_rt`. |
| `POST` | `/api/users/public/auth/refresh` | — (lee `fu_rt` o `fu_at`) | `{ expiresIn: 3600 }` + `Set-Cookie: fu_at, fu_rt` | 200 / 401 | Renueva sesión. Si no hay cookies, devuelve 401 `session-closed`. |
| `POST` | `/api/users/auth/logout` | — | — + `Set-Cookie: fu_at, fu_rt (Max-Age=0)` | 204 | Cierra sesión y expira cookies de sesión. |
| `GET` | `/api/users/me` | — (requiere `fu_at` / `X-User-Id`) | `MeResponse` | 200 / 401 | Devuelve perfil propio. Si no hay identidad, responde 401 `not-authenticated`. |
| `PATCH` | `/api/users/me/onboarding` | `{ tourOk }` | — | 204 | Marca finalización del tour interactivo de onboarding. |
| `GET` | `/api/users` | — | `UserListItem[]` | 200 | Directorio de usuarios activos del sistema. |
| `GET` | `/api/users/profile/{id}` | — | `PublicProfile` | 200 / 404 | Perfil público de un usuario. Muestra `email` y `legajo` únicamente a rol `ADMIN`. |
| `GET` | `/api/users/public/legal/terms` | — | `{ version: "v1", texto: "..." }` | 200 | Términos y condiciones del servicio. |
| `POST` | `/api/users/public/auth/token` | `{ clientId, clientSecret, grantType, scope, audience }` | `{ accessToken, tokenType: "bearer", expiresIn: 3600 }` | 200 | Emisión de token de servicio M2M (`type: "service"`) para consumidores como Roadmap. |

### Shapes de Datos

#### `MeResponse`
```json
{
  "id": "30000000-0000-4000-8000-000000000001",
  "firstNames": "Alumno 01",
  "lastNames": "UTN",
  "legajo": "10001",
  "email": "alumno01@frc.utn.edu.ar",
  "role": "STUDENT",
  "accountStatus": "ACTIVE",
  "mustChangePassword": false,
  "firstLogin": false,
  "guidedTourCompleted": true,
  "githubUsername": "alumno01-dev",
  "avatarRef": null,
  "avatarUrl": null,
  "emailVerified": true,
  "createdAt": "2026-09-01T08:00:00.000Z",
  "termsAcceptedAt": "2026-09-01T08:05:00.000Z",
  "termsVersion": "v1"
}
```

#### `PublicProfile`
```json
{
  "id": "2db91e4f-a408-4b4f-85ec-a68804984cad",
  "firstNames": "Profesor",
  "lastNames": "Demo",
  "githubUsername": "profesor-utn",
  "avatarRef": null,
  "avatarUrl": null,
  "email": null,
  "legajo": null,
  "accountStatus": null
}
```

---

## 4. Endpoints Exclusivos del Mock (R3)

| Método | Path | Request Body | Response Body | Propósito |
|---|---|---|---|---|
| `GET` | `/api/users/mock/ping` | — | `{ service, ok: true }` | Liveness check básico y smoke test. |
| `GET` | `/api/users/mock/echo` | — | Headers recibidos | Diagnóstico de inyección perimetral de headers (`X-Principal-Type`, `X-User-*`, `X-Service-*`). |
| `GET` | `/api/users/mock/users` | — | `[{ id, email, role, firstNames, lastNames }]` | Listado rápido de usuarios disponibles para el panel de control. |
| `POST` | `/api/users/mock/users` | `{ firstNames, lastNames, email, role, legajo? }` | `User` (201) | Creación dinámica de usuarios de prueba. |
| `POST` | `/api/users/mock/login-as/{id}` | — | `MeResponse` (200) + `Set-Cookie: fu_at, fu_rt` | Establece sesión inmediata del usuario sin requerir flujo 2FA (usado por el panel). |
| `POST` | `/api/users/mock/fault` | `{ status, delayMs, pathPrefix?, times? }` | `{ ok: true, fault }` | Inyección de fallas simuladas (ej. latencia o errores 503). |
| `DELETE` | `/api/users/mock/fault` | — | `{ ok: true, cleared: true }` | Limpieza de fallas simuladas. |
