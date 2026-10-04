# Análisis de Consumo Frontend: 2026-PIV-TPI-FE

> **Repositorio analizado:** `Frontend/2026-PIV-TPI-FE`  
> **Fecha:** 3 de octubre de 2026  
> **Propósito:** Relevar de forma exhaustiva los contratos, endpoints, interceptores, guards y flujos de autenticación/consumo de la SPA Angular para la construcción del Mock Stack Dockerizado del Grupo 10 (`tpi-roadmap`).  
> **Regla de integridad:** Solo lectura sobre el código analizado. Citas en formato `archivo:línea`. Datos técnicos concretos, verificables y copiables.

---

## 1. Base URL(s) y Configuración por Entorno

### 1.1 Configuración de Angular (`environments` y `angular.json`)

El frontend de Angular está configurado bajo una premisa fundamental: **prohibido hardcodear URLs absolutas en el código TypeScript** (`PROXY.md:10-11`, `api.config.ts:1-18`).

- **Archivo de Desarrollo:** `Frontend/2026-PIV-TPI-FE/src/environments/environment.ts:1-5`
  ```typescript
  export const environment = {
    production: false,
    apiUrl: '/api',
  };
  ```
- **Archivo de Producción:** `Frontend/2026-PIV-TPI-FE/src/environments/environment.production.ts:1-5`
  ```typescript
  export const environment = {
    production: true,
    apiUrl: '/api',
  };
  ```
- **Reemplazo de archivos en build:** `Frontend/2026-PIV-TPI-FE/angular.json:61-66`
  Configurado en `projects.app.architect.build.configurations.production.fileReplacements`:
  ```json
  "fileReplacements": [
    {
      "replace": "src/environments/environment.ts",
      "with": "src/environments/environment.production.ts"
    }
  ]
  ```
- **Configuración de Proxy en Serve:** `Frontend/2026-PIV-TPI-FE/angular.json:86-88`
  ```json
  "development": {
    "buildTarget": "app:build:development",
    "proxyConfig": "proxy.conf.json"
  }
  ```

### 1.2 Resolución de URLs en el Cliente

Existen dos mecanismos en TypeScript para invocar endpoints:

1. **`HttpGenericService` (`Frontend/2026-PIV-TPI-FE/src/app/core/http/http-generic.service.ts:38-53`):**
   Posee un normalizador de URLs (`resolveUrl(endpoint: string)`):
   - Si el endpoint inicia con `http://` o `https://`, se utiliza sin modificación.
   - Si no empieza con `environment.apiUrl` (`/api`), le antepone `/api`.
   - Ejemplo: `/course/course-cohorts` se convierte automáticamente en `/api/course/course-cohorts`.
2. **`API_BASE` y catálogo `API` (`Frontend/2026-PIV-TPI-FE/src/app/core/config/api.config.ts:20-53`):**
   `API_BASE = ''` (string vacío intencional). Cada constante dentro de `API` contiene la ruta relativa completa a partir de `/api` (ej. `login: '/api/users/public/auth/login'`). De este modo, la petición siempre es relativa al host/puerto que sirvió la aplicación.

### 1.3 Perfiles de Proxy de Desarrollo Local

Para evitar CORS y desacoplar equipos, `ng serve` utiliza proxies inversos de desarrollo basados en Webpack / Vite Dev Server:

1. **`proxy.conf.json` (`Frontend/2026-PIV-TPI-FE/proxy.conf.json:1-285`):**
   Perfil predeterminado (`npm run dev`). Mapea rutas `/api/...` a microservicios en puertos locales e inyecta cabeceras fijas para saltear pasarelas cuando no está levantado el API Gateway:
   - `/api/users`: target `http://localhost:8001` (Mock Auth / users-service).
   - `/api/course/enrollments`: target `http://localhost:8086` con headers fijos (`X-Principal-Type: user`, `X-User-Id: 7b1d6c1e-4d7a-4f4e-9a55-0c2f1d3b8a10`, `X-User-Roles: STUDENT`).
   - `/api/course`: target `http://localhost:8086` con headers fijos (`X-Principal-Type: user`, `X-User-Id: 2db91e4f-a408-4b4f-85ec-a68804984cad`, `X-User-Roles: GESTOR`).
   - `/api/v1/courses`, `/api/v1/cohorts`: target `http://localhost:8086`.
   - `/api/v1/challenges`: target `http://localhost:8003`.
   - `/api/theoretical-challenge/attempts`: target `http://localhost:8088` con headers fijos (`X-Principal-Type: user`, `X-User-Id: dev-student-1`, `X-User-Roles: STUDENT`).
   - `/api/theoretical-challenge`: target `http://localhost:8088` con headers fijos (`X-Principal-Type: user`, `X-User-Id: dev-professor-1`, `X-User-Roles: PROFESSOR`).
   - `/api/practical-challenge`: target `http://localhost:8086`.
   - `/api/accounting`: target `http://localhost:8090` con headers fijos (`STUDENT`, `7b1d6c1e-...`).
   - `/api/market`: target `http://localhost:8084` con headers fijos (`PROFESSOR`, `40000000-0000-4000-8000-000000000001`).
   - `/api/roadmap`: target `http://localhost:8010` con headers fijos:
     ```json
     "headers": {
       "X-Principal-Type": "user",
       "X-User-Id": "30000000-0000-4000-8000-000000000001",
       "X-User-Roles": "ADMIN,STUDENT"
     }
     ```
   - `/api` (Fallback): target `http://localhost:8080` (API Gateway unificado).
2. **`proxy.conf.professor.cjs` (`Frontend/2026-PIV-TPI-FE/proxy.conf.professor.cjs:1-26`):**
   Sobrescribe `/api/practical-challenge` con cabeceras `X-User-Roles: PROFESSOR`, `X-User-Id: dev-professor-1` (`npm run dev:professor`).
3. **`proxy.conf.backoffice-gateway.cjs` (`Frontend/2026-PIV-TPI-FE/proxy.conf.backoffice-gateway.cjs:1-43`):**
   Envía las rutas administrativas (`/api/administration`, `/api/reports`, `/api/backoffice`) al API Gateway en `http://localhost:8080` (o `process.env.GATEWAY_URL`), reescribiendo los prefijos hacia `/api/backoffice/**`.
4. **`proxy.mesh.conf.json` (`Frontend/2026-PIV-TPI-FE/proxy.mesh.conf.json:1-9`):**
   Redirige todo `/api` hacia el gateway remoto en la red Tailscale (`http://tpi-plataforma.tail767776.ts.net:8080`).

### 1.4 Entorno de Producción y Docker Edge

- **Servidor Nginx de la SPA:** `Frontend/2026-PIV-TPI-FE/nginx.conf:1-43`
  - Expone el puerto `4200` dentro del contenedor `webapp`.
  - Entrega únicamente archivos estáticos generados por el build (`dist/app/browser`).
  - **No procesa llamadas a `/api/`:** El encabezado del archivo especifica claramente (`nginx.conf:1-3`):
    > *"Routing belongs to the platform edge (tpi-system-compose nginx, :3000): /api/ never reaches this server, and this container has no route to the gateway."*
  - En un stack dockerizado, un reverse proxy Edge (Nginx en `:3000`) escucha al usuario y bifurca:
    - `/` y rutas SPA -> Contenedor Frontend `:4200`.
    - `/api/` -> Contenedor API Gateway (`tpi-api-gateway`) `:8080`.

---

## 2. Flujo de Autenticación, Sesión y Autorización

### 2.1 Arquitectura de Tokens y Cookies

El frontend implementa una arquitectura **BFF-style sin tokens en JavaScript**:
- **Almacenamiento de Tokens:** Los tokens JWT (Access Token y Refresh Token) viajan **estrictamente en cookies `HttpOnly`** (`fu_at` y `fu_rt` en el entorno oficial/Gateway, o `tpi_session` en el `mock-server`).
- **Inaccesibilidad desde JS:** El código JavaScript del frontend **NO puede leer, escribir ni persistir tokens** (`TokenStoreService.ts:18-22`). No existe `localStorage.getItem('token')` ni decodificación manual de JWTs mediante `jwt-decode`.
- **Mantenimiento de sesión:** La sesión en memoria se mantiene en `TokenStoreService` mediante Angular Signals (`_claims`, `_authenticated`). Al recargar la página (`F5`), se restaura invocando `GET /api/users/me` mediante `AuthService.restoreSession()`.

### 2.2 Reclamaciones ("Claims") Simuladas en Memoria

Dado que JavaScript no tiene acceso al JWT, `TokenStoreService` deriva una estructura equivalente a los claims (`SessionClaims`) a partir de la respuesta de `GET /api/users/me` (`TokenStoreService.ts:8-16`, `auth.model.ts:11-17`):

```typescript
function claimsFromMe(me: MeResponse): SessionClaims {
  return {
    sub: me.id,
    roles: [me.role],
    est: me.accountStatus,
    pwd: me.mustChangePassword,
    onb: me.firstLogin,
  };
}
```

Las propiedades leídas por la aplicación son:
- **`sub` (User ID):** UUID del usuario autenticado (`me.id`).
- **`roles`:** Array de roles `['STUDENT']`, `['PROFESSOR']`, `['GESTOR']` o `['ADMIN']` (`me.role`).
- **`est` (Account Status):** Estado de la cuenta (`'ACTIVE'`, `'PENDING_EMAIL'`, `'PENDING_COURSE'`, etc.).
- **`pwd` (Password Change Required):** Booleano que indica si debe cambiar contraseña en el primer inicio.
- **`onb` (Onboarding Pending):** Booleano `firstLogin` que indica si tiene el tour/onboarding pendiente.
- **Nombre y Apellido:** `me.firstNames` y `me.lastNames` (almacenados en `AuthService.currentUser: signal<CurrentUser>`).

### 2.3 Flujo Paso a Paso de Login

El ciclo de autenticación consta de dos factores obligatorios:

```
[Usuario] 
   │
   ├─ 1. POST /api/users/public/auth/login { email, password }
   │     └─ Responde: { challengeId, message }
   │
   ├─ 2. Redirección a /verify-code (LoginFlowState guarda challengeId y email)
   │
   ├─ 3. POST /api/users/public/auth/2fa/verify { challengeId, code }
   │     └─ Responde: { expiresIn: 3600 } + Set-Cookie (HttpOnly: fu_at / fu_rt)
   │
   ├─ 4. scheduleSilentRefresh(expiresIn): Temporizador a los (expiresIn - 60) seg
   │
   ├─ 5. GET /api/users/me (el navegador adjunta la cookie HttpOnly automáticamente)
   │     └─ Responde MeResponse: { id, role, accountStatus, mustChangePassword, firstLogin, ... }
   │
   ├─ 6. TokenStoreService.setFromMe(me) inicializa _claims y _authenticated
   │
   └─ 7. Redirección a /dashboard (o returnUrl), evaluado por gatesGuard
```

1. **Paso 1 (Contraseña):** `LoginPageComponent.submit()` (`login-page.component.ts:100-139`) llama a `AuthService.login()` (`auth.service.ts:69-71`), enviando `LoginRequest`:
   ```json
   {
     "email": "alumno@frc.utn.edu.ar",
     "password": "alumno123"
   }
   ```
   El backend responde `200 OK` con `LoginChallengeResponse`:
   ```json
   {
     "challengeId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
     "message": "Te enviamos un código por email."
   }
   ```
2. **Paso 2 (2FA / Código OTP):** `Verify2faPageComponent.submit()` (`verify-2fa-page.component.ts:117-150`) invoca `AuthService.verify2fa()` (`auth.service.ts:77-82`), enviando `Verify2faRequest`:
   ```json
   {
     "challengeId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
     "code": "123456"
   }
   ```
   El backend responde `200 OK` con `SessionResponse`:
   ```json
   {
     "expiresIn": 3600
   }
   ```
   E inyecta la cookie de sesión en la cabecera `Set-Cookie`.
3. **Paso 3 (Carga de Perfil):** En la tubería RxJS (`auth.service.ts:79-81`), se ejecuta `scheduleSilentRefresh` y `populateClaims()`, que dispara `GET /api/users/me` (`auth.service.ts:232-234`).
4. **Paso 4 (Silent Refresh):** Cada `(expiresIn - 60)` segundos, `AuthService.refresh()` emite `POST /api/users/public/auth/refresh` con contexto `SILENT_AUTH_CHECK = true` y utiliza `navigator.locks.request('fu-auth-refresh')` para serializar la rotación de cookies entre pestañas abiertas del navegador (`auth.service.ts:104-118`).
5. **Cierre de Sesión:** `AuthService.logout()` (`auth.service.ts:139-144`) invoca `POST /api/users/auth/logout`, limpia las cookies en el backend, cancela el temporizador de refresh y limpia `TokenStoreService`, notificando a otras pestañas mediante `BroadcastChannel('fu-auth')` con el mensaje `'session-cleared'`.

### 2.4 Interceptores HTTP

Configurados en `Frontend/2026-PIV-TPI-FE/src/app/app.config.ts:33-41`:

1. **`adminErrorInterceptor` (`features/admin/.../admin-error.interceptor.ts`):** Captura errores en rutas de administración para desplegar banners específicos.
2. **`loggingInterceptor` (`core/interceptors/logging.interceptor.ts:1-35`):** Registra duración, URLs y códigos de respuesta en consola de desarrollo.
3. **`authInterceptor` (`core/interceptors/auth.interceptor.ts:65-146`):**
   - **NO inyecta cabecera `Authorization: Bearer`:** Las cookies viajan solas por transporte del navegador.
   - **Gestión de Errores RFC 7807 (`ProblemDetails`):** Analiza el campo `type` (o `slug`) del error:
     - `session-closed`, `session-superseded`, `not-authenticated` (HTTP 401): Limpia sesión local y redirige a `/login?reason=<slug>` (salvo si la petición tenía `SILENT_AUTH_CHECK`).
     - `pending-account` (HTTP 403): Redirige a `/account-pending`.
     - `password-change-required` (HTTP 403): Redirige a `/change-password`.
     - `onboarding-pending` (HTTP 403): Redirige a `/onboarding`.
     - `service-unavailable` (HTTP 503): Lee la cabecera `Retry-After` y reintenta la petición una única vez tras el lapso indicado.
4. **`caseConverterInterceptor` (`core/interceptors/case-converter.interceptor.ts:30-60`):**
   - Transforma automáticamente los objetos del body saliente de **`camelCase` a `snake_case`**.
   - Transforma automáticamente los objetos del body entrante de **`snake_case` a `camelCase`**.
   - **Escape hatch:** Si la petición incluye en su `HttpContext` el token `SKIP_CASE_CONVERSION: true`, el interceptor omite la transformación. Se utiliza en llamadas a microservicios que son nativamente camelCase (`users`, `tpi-practical-challenge`, `tpi-course`, `tpi-roadmap`).
   - Los payloads binarios (`FormData`, `Blob`, `ArrayBuffer`) se ignoran automáticamente.

### 2.5 Guards y Control de Acceso

- **`authGuard` (`src/app/core/auth/auth.guard.ts:5-10`):** Comprueba `tokenStore.isAuthenticated()`. Si es falso, guarda `state.url` como `returnUrl` y redirige a `/login`.
- **`guestGuard` (`src/app/core/auth/auth.guard.ts:12-17`):** Comprueba que **NO** haya sesión activa. Si el usuario ya está autenticado, lo desvía a `/dashboard`. Protege `/login`, `/register`, `/forgot-password`.
- **`gatesGuard` (`src/app/core/guards/gates.guard.ts:11-28`):** Protege todas las rutas de negocio tras el login. Aplica tres compuertas secuenciales:
  1. Si `accountStatus !== 'ACTIVE'` -> Redirige a `/account-pending`.
  2. Si `mustChangePassword === true` -> Redirige a `/change-password`.
  3. Si `onboardingPending === true` (`firstLogin === true`) -> Redirige a `/onboarding`.
  4. Si pasa las 3 compuertas -> Permite el acceso.
- **`permissionGuard(capability)` (`src/app/core/guards/permission.guard.ts:14-35`):** Implementado como `CanMatchFn` para evitar descargar chunks perezosos si faltan permisos. Consulta `PermissionsService` (`permissions.service.ts:18-25`):
  - `requestWhitelist`: `['PROFESSOR']`
  - `authorChallenges`: `['PROFESSOR']`
  - `manageUsers`: `['ADMIN', 'GESTOR']` (Protege `/admin`)
  - `createUsers`: `['ADMIN']`
  - `manageWhitelist`: `['ADMIN', 'GESTOR']`
  - `editGlobalConfig`: `['ADMIN']`

---

## 3. Inventario Completo de Llamadas HTTP

### 3.1 Dominio Users / Identidad (`tpi-users` / Mock Server)

| Método | Path Relativo / Endpoint | Archivo y Línea | Request Body (Shape) | Response Body (Shape / Interfaz) | Conversión Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/users/public/auth/login` | `auth.service.ts:70` | `LoginRequest`: `{ email: string, password: string }` | `LoginChallengeResponse`: `{ challengeId: string, message: string }` | `SKIP_CASE_CONVERSION: true` |
| `POST` | `/api/users/public/auth/2fa/verify` | `auth.service.ts:78` | `Verify2faRequest`: `{ challengeId: string, code: string }` | `SessionResponse`: `{ expiresIn: number }` + Cookie | `SKIP_CASE_CONVERSION: true` |
| `POST` | `/api/users/public/auth/refresh` | `auth.service.ts:110` | `{}` | `SessionResponse`: `{ expiresIn: number }` + Cookie | `SKIP_CASE_CONVERSION: true` |
| `POST` | `/api/users/auth/logout` | `auth.service.ts:140` | `{}` | `void` (204 No Content) | `SKIP_CASE_CONVERSION: true` |
| `GET` | `/api/users/me` | `auth.service.ts:233`, `profile.service.ts:35` | Ninguno | `MeResponse`: `{ id: string, firstNames: string, lastNames: string, legajo?: string, email: string, role: Role, accountStatus: AccountStatus, mustChangePassword: boolean, firstLogin: boolean, guidedTourCompleted: boolean, githubUsername?: string, avatarRef?: string\|null, emailVerified: boolean, createdAt?: string, termsAcceptedAt?: string, termsVersion?: string }` | Automática (acepta snake/camel) |
| `PATCH` | `/api/users/me/onboarding` | `auth.service.ts:224` | `OnboardingRequest`: `{ tourOk: boolean }` | `void` (200 / 204) | `SKIP_CASE_CONVERSION: true` |
| `POST` | `/api/users/auth/password/change` | `auth.service.ts:220` | `PasswordChangeRequest`: `{ currentPassword: string, newPassword: string }` | `void` (200 / 204) | `SKIP_CASE_CONVERSION: true` |
| `POST` | `/api/users/public/auth/password/reset` | `auth.service.ts:212` | `PasswordResetRequest`: `{ email: string }` | `void` (200 / 204) | `SKIP_CASE_CONVERSION: true` |
| `POST` | `/api/users/public/auth/password/reset/confirm` | `auth.service.ts:216` | `PasswordResetConfirmRequest`: `{ token: string, newPassword: string }` | `void` (200 / 204) | `SKIP_CASE_CONVERSION: true` |
| `POST` | `/api/users/public/registration/student` | `auth.service.ts:192` | `StudentRegistrationRequest`: `{ firstNames: string, lastNames: string, legajo: string, email: string, password: string, invitationCode: string, termsVersion: string }` | `void` (201 Created) | `SKIP_CASE_CONVERSION: true` |
| `POST` | `/api/users/public/registration/professor` | `auth.service.ts:196` | `ProfessorRegistrationRequest`: `{ firstNames: string, lastNames: string, email: string, password: string, termsVersion: string }` | `void` (201 Created) | `SKIP_CASE_CONVERSION: true` |
| `POST` | `/api/users/public/registration/gestor` | `auth.service.ts:200` | `GestorRegistrationRequest`: `{ firstNames: string, lastNames: string, email: string, password: string, termsVersion: string }` | `void` (201 Created) | `SKIP_CASE_CONVERSION: true` |
| `POST` | `/api/users/public/registration/activate` | `auth.service.ts:204` | `ActivateAccountRequest`: `{ token: string }` | `void` (200 / 204) | `SKIP_CASE_CONVERSION: true` |
| `POST` | `/api/users/public/registration/resend-activation` | `auth.service.ts:208` | `ResendActivationRequest`: `{ email: string }` | `void` (200 / 204) | `SKIP_CASE_CONVERSION: true` |
| `GET` | `/api/users/public/legal/terms` | `auth.service.ts:254` | Ninguno | `TermsOfService`: `{ version: string, texto?: string }` | Automática |
| `GET` | `/api/users/profile/{id}` | `profile.service.ts:40` | Ninguno | `PublicProfile`: `{ id: string, firstNames: string, lastNames: string, githubUsername?: string, avatarRef?: string\|null, email: string\|null, legajo: string\|null, accountStatus: AccountStatus\|null }` | Automática |
| `GET` | `/api/users` | `courses.service.ts:122`, `admin-users.service.ts:27` | Ninguno | Array de `AdminUser` / `{ id, firstNames, lastNames, email, role, accountStatus, legajo, createdAt }` | Automática |
| `POST` | `/api/users` | `admin-users.service.ts:31` | `CreateUserRequest`: `{ firstNames: string, lastNames: string, email: string, password: string }` | `AdminUser`: `{ id, email, firstNames, lastNames, role, accountStatus, createdAt }` | `SKIP_CASE_CONVERSION: true` |
| `DELETE` | `/api/users/{id}` | `admin-users.service.ts:35` | `DeleteUserRequest`: `{ reason: string }` | `void` (204 No Content) | `SKIP_CASE_CONVERSION: true` |
| `PATCH` | `/api/users/{id}/role` | `admin-users.service.ts:42` | `ChangeRoleRequest`: `{ roles: Role[] }` | `AdminUser` | `SKIP_CASE_CONVERSION: true` |
| `GET` | `/api/users/whitelist` | `admin-users.service.ts:56` | Ninguno | `WhitelistEntry[]`: Array de `{ id: string, email: string, role: Role, createdAt: string }` | Automática |
| `POST` | `/api/users/whitelist` | `admin-users.service.ts:51` | `AddEmailRequest`: `{ email: string, role: Role }` | `{ id: string }` | `SKIP_CASE_CONVERSION: true` |
| `DELETE` | `/api/users/whitelist/{id}` | `admin-users.service.ts:61` | Ninguno | `void` (204 No Content) | Automática |
| `GET` | `/api/users/whitelist/requests` | `admin-users.service.ts:66` | Ninguno | `WhitelistRequest[]`: Array de `{ id, email, requestedBy, status, reason, createdAt, reviewedAt? }` | Automática |
| `POST` | `/api/users/whitelist/requests` | `admin-users.service.ts:46`, `profile.service.ts:52` | `CreateWhitelistRequest`: `{ email: string, reason: string }` | `WhitelistRequest` | `SKIP_CASE_CONVERSION: true` |
| `PATCH` | `/api/users/whitelist/requests/{id}` | `admin-users.service.ts:70` | `ReviewWhitelistRequest`: `{ approve: boolean, rejectionReason?: string }` | `void` | `SKIP_CASE_CONVERSION: true` |
| `GET` | `/api/users/me/git-links` | `git-link.service.ts:49` | Ninguno | `GitProviderLinkView[]`: Array de `{ provider: string, username: string, linkedAt: string }` | Automática |
| `POST` | `/api/users/me/git-links/{provider}/start` | `git-link.service.ts:37` | `{}` | `GitLinkStartResponse`: `{ authorizationUrl: string }` | Automática |
| `POST` | `/api/users/me/git-links/{provider}/callback` | `git-link.service.ts:41` | `GitLinkCallbackRequest`: `{ code: string, state: string }` | `GitLinkResponse`: `{ provider: string, username: string }` | Automática |
| `DELETE` | `/api/users/me/git-links/{provider}` | `git-link.service.ts:45` | Ninguno | `void` | Automática |

---

### 3.2 Dominio Courses / Matrícula (`tpi-course`)

| Método | Path Relativo / Endpoint | Archivo y Línea | Request Body (Shape) | Response Body (Shape / Interfaz) | Observaciones |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/course/institution?name={name}` | `courses.service.ts:46` | Ninguno | `InstitutionResponse`: `{ id: string, name: string }` | Resuelve institución académica base |
| `GET` | `/api/course/course-base/institution/{institutionId}` | `courses.service.ts:51` | Ninguno | `CourseBaseResponse[]`: Array de `{ id: string, name: string, description: string, institutionId: string, active: boolean }` | Listado de materias base |
| `POST` | `/api/course/course-base` | `courses.service.ts:59` | `CreateCourseBaseRequest`: `{ name: string, description: string, institutionId: string }` | `CourseBaseResponse` | Se envía como texto JSON para saltear snake_case |
| `POST` | `/api/course/course-cohorts` | `courses.service.ts:79` | `CreateCourseCohortRequest`: `{ courseBaseId: string, startDate: string, endDate: string, professorId?: string, professorIds?: string[], settings?: CohortSettings }` | `CourseCohortResponse`: `{ id: string, courseBaseId: string, courseBaseName: string, status: string, startDate: string, endDate: string, invitationCode: string, settings?: CohortSettings }` | Alta de cohorte en estado DRAFT |
| `GET` | `/api/course/course-cohorts/me?page={p}&size={s}&status={st}` | `courses.service.ts:161` | Ninguno | `CourseCohortPageResponse`: `{ content: CourseCohortResponse[], page: number, size: number, totalElements: number, totalPages: number }` | Cohortes del profesor autenticado |
| `GET` | `/api/course/course-cohorts/{id}` | `courses.service.ts:213` | Ninguno | `CourseCohortDetail`: `{ id, courseBaseId, courseBaseName, status, startDate, endDate, professorRole, invitationCode, settings }` | Detalle de cohorte |
| `PATCH` | `/api/course/course-cohorts/{id}` | `courses.service.ts:363` | `UpdateCohortConfigurationRequest`: `{ displayName?: string, description?: string, color?: string, startDate?: string, endDate?: string }` | `CourseCohortDetail` | Edición de metadatos de la cohorte |
| `POST` | `/api/course/course-cohorts/{id}/invitation-code` | `courses.service.ts:87` | `{}` | `CourseCohortResponse` | Regenera código de invitación |
| `PATCH` | `/api/course/course-cohorts/{id}/activate` | `courses.service.ts:95` | `{}` | `CourseCohortResponse` | Activa cohorte (`DRAFT` -> `ACTIVE`) |
| `PATCH` | `/api/course/course-cohorts/{id}/deactivate` | `courses.service.ts:103` | `{}` | `void` (204 No Content) | Baja lógica de la cohorte |
| `GET` | `/api/course/course-cohorts/{id}/membership` | `courses.service.ts:249`, `cohort-membership.service.ts:51` | Ninguno | `CohortMembershipResponse`: `{ courseCohortId: string, role: 'GESTOR'\|'PROFESSOR'\|'READ_ONLY_PROFESSOR', canRead: boolean, canWrite: boolean }` | Permisos del docente sobre la cohorte |
| `GET` | `/api/course/course-cohorts/{id}/professors?page=0&size=20&sort=professorId,asc` | `courses.service.ts:286` | Ninguno | `CourseCohortProfessorPageResponse`: `{ content: CourseCohortProfessorItem[], page, size, totalElements, totalPages }` | Docentes asignados a la cohorte |
| `POST` | `/api/course/course-cohorts/{id}/professors` | `courses.service.ts:300` | `InviteProfessorRequest`: `{ professorId: string, professorRole: string }` | `CourseCohortProfessorItem`: `{ id, professorId, professorRole, assignedAt }` | Asigna docente a la comisión |
| `GET` | `/api/course/course-cohorts/{cohortId}/students?page={p}&size={s}&search={q}` | `courses.service.ts:189`, `roster.models.ts:33` | Ninguno | `CohortRosterPageResponse`: `{ content: RosterStudent[], page, size, totalElements, totalPages }` con `RosterStudent: { studentNumber, firstName, lastName, institutionalEmail }` | Padrón oficial de alumnos |
| `GET` | `/api/course/course-cohorts/{cohortId}/student-roster` | `courses.service.ts:202`, `roster.models.ts:40` | Ninguno | `Blob` (archivo CSV binario) | Descarga completa del padrón |
| `GET` | `/api/course/course-cohorts/{cohortId}/student-template` | `csv-import.service.ts:69` | Ninguno | `Blob` (archivo CSV plantilla) | Descarga de plantilla CSV |
| `POST` | `/api/course/course-cohorts/{cohortId}/student-template` | `csv-import.service.ts:83` | `FormData` con campo `file` | `RawStudentRosterUploadSummaryDto`: `{ processedCount: number, addedCount: number, duplicatesCount: number, rejectedCount: number, errors: CsvImportRowError[] }` | Carga e ingesta masiva de alumnos |
| `GET` | `/api/course/course-cohorts/{cohortId}/enrollments?page={p}&size={s}&status={st}` | `courses.service.ts:332` | Ninguno | `EnrollmentPageResponse`: `{ content: EnrollmentResponse[], page, size, totalElements, totalPages }` | Solicitudes de inscripción |
| `POST` | `/api/course/enrollments/{enrollmentId}/approve-exception` | `courses.service.ts:338` | `{ reason: string }` | `EnrollmentResponse`: `{ id, courseCohortId, studentId, studentNumber, status: 'VALIDATED', ... }` | Aprobación por excepción docente |
| `POST` | `/api/course/enrollments/{enrollmentId}/reject` | `courses.service.ts:346` | `{ reason: string }` | `EnrollmentResponse`: `{ id, courseCohortId, studentId, studentNumber, status: 'REJECTED', ... }` | Rechazo de solicitud |
| `GET` | `/api/course/enrollments/me` | `course-enrollments-api.service.ts:43` | Ninguno | `BackendCourseEnrollment[]`: Array de `{ enrollmentId: string, cohortId: string, courseBaseName: string, courseBaseDescription: string\|null, cohortStatus: string, startDate: string, endDate: string, enrollmentStatus: string, enrolledDatetime: string }` | Cursos donde el alumno está inscripto (STUDENT only) |
| `GET` | `/api/course/course-cohorts/{cohortId}/sections?page={p}&size={s}` | `sections.service.ts:62` | Ninguno | `SectionPageResponse`: `{ content: SectionResponse[], page: number, size: number, totalElements: number, totalPages: number }` | Secciones activas de la cohorte |
| `GET` | `/api/course/course-sections/{id}` | `sections.service.ts:80` | Ninguno | `SectionResponse`: `{ id: string, courseCohortId: string, title: string, description?: string, orderIndex: number, visible: boolean, active: boolean, createdAt: string, updatedAt: string }` | Detalle de sección |
| `POST` | `/api/course/course-cohorts/{cohortId}/sections` | `sections.service.ts:95` | `CreateSectionRequest`: `{ title: string, description?: string, visible?: boolean, orderIndex?: number }` | `SectionResponse` | Creación de sección (`SKIP_CASE_CONVERSION: true`) |
| `PUT` | `/api/course/course-sections/{id}` | `sections.service.ts:112` | `UpdateSectionRequest`: `{ title: string, description?: string, visible: boolean }` | `SectionResponse` | Modificación de sección |
| `DELETE` | `/api/course/course-sections/{id}` | `sections.service.ts:127` | Ninguno | `void` (204 No Content) | Baja lógica de sección |
| `PUT` | `/api/course/course-cohorts/{cohortId}/sections/order` | `sections.service.ts:162` | `ReorderSectionsRequest`: `{ orderedSectionIds: string[] }` | `SectionPageResponse` | Reordenamiento de secciones |

---

### 3.3 Dominio Challenges / Desafíos (Prácticos y Teóricos)

#### Desafíos Prácticos (`tpi-practical-challenge`, base `/api/practical-challenge`):

| Método | Path Relativo / Endpoint | Archivo y Línea | Request Body (Shape) | Response Body (Shape / Interfaz) | Observaciones |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/practical-challenge/challenges` | `challenge-authoring.service.ts:78` | Ninguno | `PracticalChallengeSummary[]`: Array de `{ id, title, language, difficulty, status, createdAt, updatedAt }` | Desafíos creados por el profesor |
| `POST` | `/api/practical-challenge/challenges` | `challenge-authoring.service.ts:133` | `PracticalChallengeCreateRequest`: `{ title: string, language: string, difficulty: string, statement: string, initialCode?: string }` | `PracticalChallengeResponse`: `{ id, title, language, difficulty, statement, status, gitRepositoryUrl, createdAt, updatedAt }` | Alta de desafío práctico |
| `GET` | `/api/practical-challenge/challenges/{id}` | `practical-challenges.service.ts:175`, `challenge-authoring.service.ts:85` | Ninguno | `PracticalChallengeResponse` / `PracticalChallengeDetail`: `{ id, title, description, statement, language, difficulty, tags, status, allowedRetries }` | Detalle del desafío |
| `PATCH` | `/api/practical-challenge/challenges/{id}` | `challenge-authoring.service.ts:148` | `PracticalChallengeUpdateRequest`: `{ statement: string }` | `PracticalChallengeResponse` | Actualización de consigna |
| `GET` | `/api/practical-challenge/challenges/{id}/template/files` | `challenge-authoring.service.ts:94` | Ninguno | `WorkspaceFileDto[]`: Array de `{ path: string, content: string }` | Archivos de plantilla docente (incluye tests) |
| `POST` | `/api/practical-challenge/challenges/{id}/template/sync?message={msg}` | `challenge-authoring.service.ts:170` | `TemplateSyncRequest`: `{ files: WorkspaceFileDto[], deletedPaths: string[] }` | `WorkspaceSyncResult`: `{ commitHash: string, committedAt: string }` | Commit de plantilla docente |
| `GET` | `/api/practical-challenge/challenges/{id}/content/status` | `challenge-authoring.service.ts:103` | Ninguno | `ChallengeContentStatus`: `{ ready: boolean, missingPieces: string[], checks: { hasStatement: boolean, hasTests: boolean, hasTemplate: boolean } }` | Estado de completitud del desafío |
| `GET` | `/api/practical-challenge/attempts/{id}` | `practical-challenges.service.ts:166` | Ninguno | `AttemptDetail`: `{ id: string, challengeId: string, studentId: string, status: string, openedAt: string, closedAt?: string, grade?: number, remainingAttempts?: number }` | Contexto de intento de alumno |
| `GET` | `/api/practical-challenge/attempts/{id}/workspace/files?ref=main` | `practical-challenges.service.ts:185, 260` | Ninguno | `WorkspaceFileDto[]`: Array de `{ path: string, content: string }` | Archivos del workspace (código inicial o actual) |
| `POST` | `/api/practical-challenge/attempts/{id}/workspace/sync` | `practical-challenges.service.ts:271` | `WorkspaceSyncRequest`: `{ files: WorkspaceFileDto[] }` | `WorkspaceSyncResult`: `{ commitHash: string, committedAt: string }` | Guardado manual / autoguardado |
| `GET` | `/api/practical-challenge/attempts/{id}/workspace/versions?limit={n}` | `practical-challenges.service.ts:285` | Ninguno | `WorkspaceVersion[]`: Array de `{ id: string, commitHash: string, message: string, committedAt: string }` | Historial de versiones del código |
| `POST` | `/api/practical-challenge/attempts/{id}/submit` | `practical-challenges.service.ts:294` | `WorkspaceSyncRequest`: `{ files: WorkspaceFileDto[] }` | `SubmitResult`: `{ attemptId: string, commitHash: string, submittedAt: string, status: string }` | Congela entrega y dispara evaluación |
| `GET` | `/api/practical-challenge/attempts/{id}/correction` | `practical-challenges.service.ts:197` | Ninguno | `EvaluationResult`: `{ attemptId: string, status: 'PENDING'\|'CORRECTED'\|'ERROR', grade?: number, feedback?: string, testResults?: { name: string, passed: boolean, message?: string }[] }` | Polling de nota y corrección |
| `POST` | `/api/practical-challenge/engine/evaluate` | `practical-challenges.service.ts:318` | `{ submissionId: string, challengeId: string, language: string, files: WorkspaceFileDto[] }` | `void` (202 Accepted) | Reintento manual de evaluación |
| `GET` | `/api/practical-challenge/attempts/{id}/tutor/session` | `practical-challenges.service.ts:348` | Ninguno | `TutorSessionResponse`: `{ sessionId: string, attemptId: string, messages: { role: 'user'\|'assistant', content: string, sentAt: string }[] }` | Consulta sesión de tutor IA |
| `POST` | `/api/practical-challenge/attempts/{id}/tutor/session` | `practical-challenges.service.ts:364` | `{}` | `TutorSessionResponse` | Inicializa sesión de tutor IA |
| `POST` | `/api/practical-challenge/attempts/{id}/tutor/messages` | `practical-challenges.service.ts:334` | `TutorMessageRequest`: `{ content: string, currentCode?: string }` | `TutorMessageResponse`: `{ id: string, role: 'assistant', content: string, sentAt: string }` | Pregunta al tutor IA |

#### Desafíos Teóricos (`tpi-theoristcal-challenge`, base `/api/theoretical-challenge`):

| Método | Path Relativo / Endpoint | Archivo y Línea | Request Body (Shape) | Response Body (Shape / Interfaz) | Observaciones |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/theoretical-challenge/items?page={p}&size={s}&type={t}&q={q}&sort={sort}` | `theory-bank.service.ts:100` | Ninguno | `BankPage<TheoryItemSummary>`: `{ content: TheoryItemSummary[], page: number, size: number, totalElements: number, totalPages: number }` | Banco de preguntas del docente |
| `POST` | `/api/theoretical-challenge/items` | `theory-bank.service.ts:162` | `TheoryItemRequest`: `{ type: TheoryItemType, statement: string, points?: number, options?: TheoryOption[], validationRule?: string }` | `TheoryItem`: `{ id: number, type: TheoryItemType, statement: string, options?: TheoryOption[], createdAt: string }` | Alta de pregunta teórica |
| `GET` | `/api/theoretical-challenge/items/{itemId}` | `theory-bank.service.ts:153` | Ninguno | `TheoryItem` | Detalle de pregunta |
| `PUT` | `/api/theoretical-challenge/items/{itemId}` | `theory-bank.service.ts:172` | `TheoryItemRequest` | `TheoryItem` | Nueva versión inmutable de la pregunta |
| `DELETE` | `/api/theoretical-challenge/items/{itemId}` | `theory-bank.service.ts:184` | Ninguno | `void` (204 No Content) | Baja lógica de pregunta |
| `GET` | `/api/theoretical-challenge/contents?page={p}&size={s}` | `content-catalog.service.ts:43` | Ninguno | `ContentPage`: `{ content: ComposedContent[], page, size, totalElements, totalPages }` | Cuestionarios compuestos del docente |
| `POST` | `/api/theoretical-challenge/contents` | `content-catalog.service.ts:63` | `ComposeContentRequest`: `{ challengeId: string, items: ComposeQuestionRequest[] }` con `items: [{ itemId: number, points: number, orderIndex: number }]` | `ComposedContent`: `{ id: string, challengeId: string, itemsCount: number, totalPoints: number, createdAt: string }` | Composición de cuestionario para un desafío |
| `GET` | `/api/theoretical-challenge/contents/{contentId}/teacher-view` | `teacher-content-view.service.ts:28` | Ninguno | `TeacherContent`: `{ id: string, challengeId: string, items: TeacherItem[] }` | Vista previa docente con claves de corrección |
| `GET` | `/api/theoretical-challenge/attempts/{attemptId}/student-view` | `student-attempt.service.ts:41` | Ninguno | `StudentContent`: `{ attemptId: string, challengeId: string, items: StudentQuestion[] }` | Preguntas del intento (sin claves) |
| `PUT` | `/api/theoretical-challenge/attempts/{attemptId}/draft` | `student-attempt.service.ts:51` | `SaveDraftRequest`: `{ answers: StudentAnswer[] }` con `StudentAnswer: { itemId: number, selectedOptions?: string[], textAnswer?: string }` | `DraftSaved`: `{ savedAt: string }` | Autoguardado de borrador del alumno |
| `POST` | `/api/theoretical-challenge/attempts/{attemptId}/submit` | `student-attempt.service.ts:62` | `{}` | `AttemptResult`: `{ attemptId: string, status: 'SUBMITTED'\|'GRADED', grade?: number, feedback?: string, submittedAt: string }` | Entrega y corrección automática |
| `GET` | `/api/theoretical-challenge/attempts/{attemptId}/result` | `student-attempt.service.ts:74` | Ninguno | `AttemptResult` | Consulta de nota y resultado |

---

### 3.4 Dominio Roadmap / Progreso (`tpi-roadmap`, base `/api/roadmap`)

Todos los endpoints de Roadmap en el frontend devuelven una envolvente estándar **`ApiResponse<T>`** (`api-response.model.ts:5-10`), cuyo formato es:
```json
{
  "data": { ... },
  "message": "Operación exitosa",
  "success": true,
  "timestamp": "2026-10-03T18:00:00Z"
}
```

| Método | Path Relativo / Endpoint | Archivo y Línea | Request Body (Shape) | Response Body Envuelta (`data`) | Observaciones |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/roadmap/courses/{courseCohortId}` | `http-roadmap.adapter.ts:142` | Ninguno | `BackendRoadmapResponse`: `{ id: string, courseId: string, archived: boolean, sections: BackendSectionResponse[] }` donde cada sección tiene `nodes: BackendNodeResponse[]` | Grafo completo del roadmap |
| `POST` | `/api/roadmap/courses/{courseCohortId}/sections` | `http-roadmap.adapter.ts:155` | `BackendSectionRequest`: `{ name: string, sortOrder: number }` | `BackendSectionResponse`: `{ id: string, name: string, sortOrder: number, nodes: [] }` | Agrega unidad temática |
| `PUT` | `/api/roadmap/sections/{sectionId}` | `http-roadmap.adapter.ts:189, 233` | `BackendSectionRequest`: `{ name: string, sortOrder: number }` | `BackendSectionResponse` | Renombra o cambia orden de sección |
| `DELETE` | `/api/roadmap/sections/{sectionId}` | `http-roadmap.adapter.ts:212` | Ninguno | `void` (200 / 204) | Elimina sección |
| `POST` | `/api/roadmap/sections/{sectionId}/nodes` | `http-roadmap.adapter.ts:255` | `BackendNodeRequest`: `{ type: BackendNodeType, name: string, sortOrder: number, challengeId?: string, mandatory: boolean, lifeRecovery?: boolean }` | `BackendNodeResponse`: `{ id, type, name, sortOrder, mandatory, challengeId?, lifeRecovery?, prerequisiteMode?, prerequisiteNodeIds?, available? }` | Agrega nodo pedagógico a la unidad |
| `PUT` | `/api/roadmap/nodes/{nodeId}` | `http-roadmap.adapter.ts:283, 324` | `BackendNodeRequest` | `BackendNodeResponse` | Actualiza nodo pedagógico |
| `DELETE` | `/api/roadmap/nodes/{nodeId}` | `http-roadmap.adapter.ts:301` | Ninguno | `void` (200 / 204) | Elimina nodo pedagógico |
| `PATCH` | `/api/roadmap/nodes/{nodeId}/rules` | `http-roadmap.adapter.ts:435` | `BackendRulesRequest`: `{ mode: 'ALL'\|'ANY', prerequisiteNodeIds: string[] }` | `BackendRulesResponse`: `{ mode: 'ALL'\|'ANY', prerequisiteNodeIds: string[] }` | Configura aristas y reglas de desbloqueo (DAG) |
| `GET` | `/api/roadmap/courses/{courseCohortId}/students/{studentId}/progress` | `http-roadmap.adapter.ts:476`, `roadmap-progress-api.service.ts:37` | Ninguno | `BackendStudentProgress`: `{ studentId: string, courseId: string, xpTotal: number, currentLives: number, nodes: { nodeId: string, status: 'locked'\|'enabled'\|'completed' }[] }` | Progreso real del alumno en el curso |
| `GET` | `/api/roadmap/courses/{courseCohortId}/nodes/{nodeId}` | `http-roadmap.adapter.ts:517` | Ninguno | `BackendNodeDetail`: `{ id: string, status: 'UNLOCKED'\|'LOCKED', title?: string, type?: BackendNodeType, mandatory?: boolean, readByMe?: boolean }` | Detalle de nodo (si está LOCKED solo devuelve id y status) |
| `POST` | `/api/roadmap/nodes/{nodeId}/read` | `http-roadmap.adapter.ts:540` | `{}` | `BackendContentRead`: `{ studentId: string, nodeId: string, readAt: string }` | Marca contenido teórico como leído (`STUDENT` only) |

> **Nota Crítica sobre `listCourses()` en Roadmap:**  
> En `HttpRoadmapAdapter:449-453`, `listCourses()` lanza `501 Not Implemented` con código `courses.not-owned-by-roadmap`. El frontend sabe que Roadmap no es dueño de los cursos (pertenecen a Tema 02). Por esta razón, `TeacherHomePageComponent` y `MyCoursesPageComponent` muestran enlaces directos al `COURSE_SEED_ID` (`10000000-0000-4000-8000-000000000001`) cuando la lista viene vacía o da error (`teacher-home-page.component.ts:98-105`, `my-courses-page.component.ts:79-86`).

---

## 4. Análisis del Mock-Server Existente (`mock-server/server.mjs`)

### 4.1 Qué hace y cómo está implementado

El repositorio frontend contiene un servidor mock implementado en Node.js + Express:
- **Archivo principal:** `Frontend/2026-PIV-TPI-FE/mock-server/server.mjs` (308 líneas de código).
- **Base de datos semilla:** `Frontend/2026-PIV-TPI-FE/mock-server/db.json` (93 líneas).
- **Ejecución:** Se inicia mediante `npm run mock:auth` (`node mock-server/server.mjs`).
- **Puerto:** `8001`.
- **Módulos utilizados:** `express`, `cookie-parser`, `node:crypto` (`randomUUID`), `node:fs/promises`.
- **Gestión de Sesión:**
  - Emite una cookie llamada **`tpi_session`** con un UUID opaco aleatorio (`randomUUID()`), `httpOnly: true`, `sameSite: 'lax'`, `maxAge: 3600000` (`server.mjs:106-113`).
  - Mantiene dos mapas en memoria: `sessions = new Map()` (mapea `sessionToken` -> `userId`) y `challenges = new Map()` (mapea `challengeId` -> `{ userId, code }`).
  - El código de verificación 2FA se imprime en la terminal del mock server, pero incluye un **código de bypass universal (`000000`)** para automatizaciones y pruebas rápidas (`server.mjs:44, 142`).

### 4.2 Credenciales y Usuarios Sembrados (`db.json`)

| Rol | Email | Password | ID | Account Status | First Login | Must Change Pwd | Nombre Completo |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@utn.edu.ar` | `admin123` | `"1"` | `ACTIVE` | `false` | `false` | Admin Demo |
| **PROFESSOR** | `profesor@utn.edu.ar` | `profesor123` | `"2"` | `ACTIVE` | `false` | `false` | Profesor Demo |
| **GESTOR** | `gestor@utn.edu.ar` | `gestor123` | `"3"` | `ACTIVE` | `false` | `false` | Gestor Demo |
| **STUDENT** | `alumno@frc.utn.edu.ar` | `alumno123` | `"4"` | `ACTIVE` | `false` | `false` | Alumno Demo (Legajo 12345) |

### 4.3 Factibilidad y Límites de Reutilización

#### ¿Se puede reutilizar?
**Sí, parcialmente**, pero con adaptaciones críticas obligatorias.

#### Ventajas:
1. Resuelve de inmediato el flujo de UI de login: `POST /login`, `POST /2fa/verify`, `POST /refresh`, `POST /logout` y `GET /users/me`.
2. El código bypass `000000` acelera las pruebas de frontend sin requerir un servidor SMTP o envío real de mails.
3. Ya maneja las rutas de administración de usuarios y whitelist (`/api/users`, `/api/users/whitelist`).

#### Bloqueantes / Limitaciones Críticas:
1. **Incompatibilidad de Cookie con API Gateway:**
   - `mock-server/server.mjs` utiliza la cookie **`tpi_session`** con un UUID opaco.
   - El API Gateway real (`tpi-api-gateway`, ver informe `tpi-api-gateway.md:102, 365`) busca estrictamente la cookie **`fu_at`** con un JWT firmado por `users-service` (RS256) y el par de refresh en **`fu_rt`**.
   - Si se coloca el `mock-server` actual detrás del API Gateway, el Gateway rechaza todas las peticiones con HTTP 401 `not-authenticated` porque ignora `tpi_session` y no encuentra `fu_at`.
2. **Alcance limitado exclusivamente a `/api/users/**`:**
   - No tiene ningún endpoint para `/api/course/**` (Cursos/Cohortes).
   - No tiene ningún endpoint para `/api/practical-challenge/**` ni `/api/theoretical-challenge/**`.
   - No tiene ningún endpoint para `/api/roadmap/**`.
3. **Persistencia volátil en memoria:**
   - Cualquier cambio efectuado en tiempo de ejecución (creación de usuarios, cambios de roles) se pierde al reiniciar el proceso.

#### Recomendación para el Mock Stack:
Reutilizar la lógica y los usuarios de `mock-server/server.mjs`, pero:
1. Modificar la emisión de cookies para generar **`fu_at`** y **`fu_rt`**.
2. Firmar un JWT con clave privada RSA y exponer el endpoint `/.well-known/jwks.json` para que el API Gateway pueda validar la firma de la cookie `fu_at`.
3. Empaquetar este servicio mock en un contenedor Docker (`mock-users`).

---

## 5. Requerimientos Mínimos del Backend Mock (Mock Stack)

Para que el frontend pueda:
1. Loguear un **Alumno** y un **Docente**.
2. Navegar y visualizar cursos y cohortes.
3. Cargar el **Roadmap**, ver las islas en 3D, consultar el progreso de los nodos y marcar lecturas o desafíos completados.

Se requiere que el Mock Stack proporcione mínimamente los siguientes componentes y contratos:

### 5.1 Matriz de Identidad y Cuentas Sembradas

El backend mock de usuarios debe sembrar dos cuentas esenciales con IDs que coincidan exactamente con la semilla de Roadmap (`DemoData.java:18-80`, `seed.ts:18-29`):

#### 1. Cuenta Alumno (Estudiante)
- **ID:** `30000000-0000-4000-8000-000000000001` (Coincide con `DEMO_STUDENT_ID` y alumno 1 de la semilla `tpi-roadmap`).
- **Email:** `alumno@frc.utn.edu.ar`
- **Password:** `alumno123`
- **Rol:** `STUDENT`
- **Account Status:** `ACTIVE` (Crucial para pasar `gatesGuard`).
- **Must Change Password:** `false`
- **First Login / Onboarding Pending:** `false`
- **Legajo:** `12345`

#### 2. Cuenta Docente (Profesor)
- **ID:** `2db91e4f-a408-4b4f-85ec-a68804984cad` (Coincide con el gestor/profesor configurado en `proxy.conf.json:46`).
- **Email:** `profesor@utn.edu.ar`
- **Password:** `profesor123`
- **Rol:** `PROFESSOR` (o `ADMIN,PROFESSOR`)
- **Account Status:** `ACTIVE`
- **Must Change Password:** `false`
- **First Login:** `false`

---

### 5.2 Endpoints Mínimos de Auth (`users-service` / Mock)

1. **`POST /api/users/public/auth/login`**
   - Recibe: `{ "email": "...", "password": "..." }`
   - Retorna: `200 OK`
     ```json
     {
       "challengeId": "uuid-challenge-123",
       "message": "Código enviado"
     }
     ```
2. **`POST /api/users/public/auth/2fa/verify`**
   - Recibe: `{ "challengeId": "uuid-challenge-123", "code": "000000" }`
   - Retorna: `200 OK`
     ```json
     {
       "expiresIn": 3600
     }
     ```
   - Cabecera: `Set-Cookie: fu_at=<JWT_RS256>; HttpOnly; Path=/; SameSite=Lax` (y `fu_rt`) o `tpi_session` si no hay Gateway.
3. **`GET /api/users/me`**
   - Retorna: `200 OK`
     ```json
     {
       "id": "30000000-0000-4000-8000-000000000001",
       "firstNames": "Alumno",
       "lastNames": "Demo",
       "email": "alumno@frc.utn.edu.ar",
       "role": "STUDENT",
       "accountStatus": "ACTIVE",
       "mustChangePassword": false,
       "firstLogin": false,
       "guidedTourCompleted": true,
       "emailVerified": true,
       "legajo": "12345"
     }
     ```
4. **`POST /api/users/public/auth/refresh`**
   - Retorna: `200 OK` `{ "expiresIn": 3600 }` con cookie renovada.
5. **`POST /api/users/auth/logout`**
   - Retorna: `204 No Content` con cookie expirada.

---

### 5.3 Endpoints Mínimos de Cursos (`tpi-course` / Mock)

El ID del curso-cohorte debe ser estrictamente **`10000000-0000-4000-8000-000000000001`** para empalmar con la semilla de Roadmap (`COURSE_SEED_ID`).

1. **Para el Alumno (Mis Cursos / Matrículas):**
   - **`GET /api/course/enrollments/me`**
     - Retorna: `200 OK`
       ```json
       [
         {
           "enrollmentId": "enr-0000-0001",
           "cohortId": "10000000-0000-4000-8000-000000000001",
           "courseBaseName": "Programación I — 2026 C1",
           "courseBaseDescription": "Curso introductorio de algoritmos y estructuras de datos",
           "cohortStatus": "ACTIVE",
           "startDate": "2026-03-01",
           "endDate": "2026-07-31",
           "enrollmentStatus": "VALIDATED",
           "enrolledDatetime": "2026-03-01T10:00:00Z"
         }
       ]
       ```
2. **Para el Docente (Gestión de Cohortes):**
   - **`GET /api/course/institution?name=UTN`**
     - Retorna: `200 OK` `{ "id": "inst-utn", "name": "UTN" }`
   - **`GET /api/course/course-cohorts/me?page=0&size=10`**
     - Retorna: `200 OK`
       ```json
       {
         "content": [
           {
             "id": "10000000-0000-4000-8000-000000000001",
             "courseBaseId": "cb-0001",
             "courseBaseName": "Programación I — 2026 C1",
             "status": "ACTIVE",
             "startDate": "2026-03-01",
             "endDate": "2026-07-31",
             "professorRole": "GESTOR",
             "invitationCode": "PROG1-2026"
           }
         ],
         "page": 0,
         "size": 10,
         "totalElements": 1,
         "totalPages": 1
       }
       ```
   - **`GET /api/course/course-cohorts/10000000-0000-4000-8000-000000000001`**
     - Retorna: `200 OK` con el detalle de la cohorte.
   - **`GET /api/course/course-cohorts/10000000-0000-4000-8000-000000000001/membership`**
     - Retorna: `200 OK`
       ```json
       {
         "courseCohortId": "10000000-0000-4000-8000-000000000001",
         "role": "PROFESSOR",
         "canRead": true,
         "canWrite": true
       }
       ```
   - **`GET /api/course/course-cohorts/10000000-0000-4000-8000-000000000001/sections?page=0&size=50`**
     - Retorna: `200 OK` `{ "content": [], "page": 0, "size": 50, "totalElements": 0, "totalPages": 0 }`

---

### 5.4 Endpoints Mínimos de Roadmap (`tpi-roadmap` Real o Mock)

El backend de `tpi-roadmap` (nuestro microservicio Grupo 10) ya implementa la semilla `dev,demo` que expone exactamente estos endpoints bajo `/api/roadmap/**`. Para que el frontend consuma el servicio real o mockeado, se requieren:

1. **Obtener el Grafo del Roadmap:**
   - **`GET /api/roadmap/courses/10000000-0000-4000-8000-000000000001`**
   - Retorna: `200 OK` con `ApiResponse<BackendRoadmapResponse>`:
     ```json
     {
       "success": true,
       "message": "Roadmap obtenido con éxito",
       "timestamp": "2026-10-03T18:00:00Z",
       "data": {
         "id": "rm-10000000-0000-4000-8000-000000000001",
         "courseId": "10000000-0000-4000-8000-000000000001",
         "archived": false,
         "sections": [
           {
             "id": "sec-01",
             "name": "Fundamentos",
             "sortOrder": 1,
             "nodes": [
               {
                 "id": "node-01-intro",
                 "type": "CONTENT",
                 "name": "Introducción a la Programación",
                 "sortOrder": 1,
                 "mandatory": true,
                 "available": true,
                 "prerequisiteMode": "ALL",
                 "prerequisiteNodeIds": []
               },
               {
                 "id": "node-02-theory",
                 "type": "THEORETICAL_CHALLENGE",
                 "name": "Quiz: Variables y Tipos",
                 "sortOrder": 2,
                 "mandatory": true,
                 "challengeId": "th-chal-01",
                 "available": true,
                 "prerequisiteMode": "ALL",
                 "prerequisiteNodeIds": ["node-01-intro"]
               },
               {
                 "id": "node-03-practice",
                 "type": "PRACTICAL_CHALLENGE",
                 "name": "Ejercicio: Calculadora Básica",
                 "sortOrder": 3,
                 "mandatory": true,
                 "challengeId": "pr-chal-01",
                 "available": false,
                 "prerequisiteMode": "ALL",
                 "prerequisiteNodeIds": ["node-02-theory"]
               }
             ]
           }
         ]
       }
     }
     ```
2. **Obtener el Progreso del Alumno:**
   - **`GET /api/roadmap/courses/10000000-0000-4000-8000-000000000001/students/30000000-0000-4000-8000-000000000001/progress`**
   - Retorna: `200 OK` con `ApiResponse<BackendStudentProgress>`:
     ```json
     {
       "success": true,
       "message": "Progreso obtenido",
       "timestamp": "2026-10-03T18:00:00Z",
       "data": {
         "studentId": "30000000-0000-4000-8000-000000000001",
         "courseId": "10000000-0000-4000-8000-000000000001",
         "xpTotal": 150,
         "currentLives": 3,
         "nodes": [
           {
             "nodeId": "node-01-intro",
             "status": "completed"
           },
           {
             "nodeId": "node-02-theory",
             "status": "enabled"
           },
           {
             "nodeId": "node-03-practice",
             "status": "locked"
           }
         ]
       }
     }
     ```
3. **Detalle de un Nodo:**
   - **`GET /api/roadmap/courses/10000000-0000-4000-8000-000000000001/nodes/{nodeId}`**
   - Retorna: `200 OK` con `ApiResponse<BackendNodeDetail>`:
     ```json
     {
       "success": true,
       "message": "Detalle del nodo",
       "timestamp": "2026-10-03T18:00:00Z",
       "data": {
         "id": "node-01-intro",
         "status": "UNLOCKED",
         "title": "Introducción a la Programación",
         "type": "CONTENT",
         "mandatory": true,
         "readByMe": true
       }
     }
     ```
4. **Marcar Contenido Teórico como Leído:**
   - **`POST /api/roadmap/nodes/{nodeId}/read`**
   - Recibe: `{}`
   - Retorna: `200 OK` con `ApiResponse<BackendContentRead>`:
     ```json
     {
       "success": true,
       "message": "Lectura registrada",
       "timestamp": "2026-10-03T18:00:00Z",
       "data": {
         "studentId": "30000000-0000-4000-8000-000000000001",
         "nodeId": "node-01-intro",
         "readAt": "2026-10-03T18:05:00Z"
       }
     }
     ```

---

### 5.5 Inyección de Cabeceras y Configuración de Pasarela

En el stack real o mockeado, los microservicios downstream (`tpi-roadmap`, `tpi-course`) no validan cookies de sesión de forma autónoma: dependen de las cabeceras HTTP propagadas por el API Gateway tras validar el token JWT (`tpi-api-gateway.md:215-225`):
- **`X-Principal-Type`:** Debe tener el valor exacto `user` (para solicitudes de usuarios) o `service` (para comunicación entre microservicios).
- **`X-User-Id`:** UUID del usuario (`30000000-0000-4000-8000-000000000001` para el alumno, `2db91e4f-a408-4b4f-85ec-a68804984cad` para el docente).
- **`X-User-Roles`:** Cadena con los roles separados por coma sin espacios:
  - Para alumno: `STUDENT`
  - Para docente: `PROFESSOR` (o `GESTOR` o `ADMIN`)
  - Para bypass en desarrollo local: `ADMIN,STUDENT` (permite que `tpi-roadmap` saltee la verificación estricta de propiedad de curso con `ADMIN` y atienda endpoints de alumno con `STUDENT`).

Si el Mock Stack utiliza un API Gateway real o simplificado:
- Debe recibir la cookie `fu_at` del navegador, validar la firma del token con la clave pública de `mock-users`, remover cabeceras entrantes falsificadas y estampar las tres cabeceras confiables (`X-Principal-Type`, `X-User-Id`, `X-User-Roles`) hacia `tpi-roadmap` y `tpi-course`.
Si el Mock Stack corre directamente con `ng serve`:
- Las cabeceras ya se encuentran preconfiguradas en `proxy.conf.json` para cada ruta individual.
