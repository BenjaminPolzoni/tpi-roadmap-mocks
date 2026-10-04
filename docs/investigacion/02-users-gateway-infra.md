# Investigación de Integración e Infraestructura Base: Users, API Gateway, Eureka y Kafka

- **Autor:** Grupo 10 (Microservicio `tpi-roadmap`)
- **Fecha:** 3 de octubre de 2026
- **Propósito:** Definir especificaciones técnicas exactas, contratos de datos y arquitectura de infraestructura para la construcción del **Mock Stack** dockerizado de pruebas locales.
- **Fuentes analizadas:**
  - `Backend/_integracion/tpi-users`
  - `Backend/_integracion/tpi-api-gateway`
  - `Backend/_integracion/tpi-system-compose`
  - `Frontend/2026-PIV-TPI-FE`
  - `Backend/tpi-roadmap`

---

## 1. Users Service (`tpi-users`): Modelo de Datos y Endpoints REST

### 1.1 Modelo de Datos de Usuario

La identidad de usuario en la plataforma está modelada en la entidad `User` (`Backend/_integracion/tpi-users/src/main/java/ar/edu/utn/frc/tup/p4/usersservice/users/entities/User.java:34-118`), la cual extiende de `BaseSoftDeletableEntity` y `BaseAuditableEntity` (`src/main/java/ar/edu/utn/frc/tup/p4/usersservice/shared/audit/BaseAuditableEntity.java:29-60`).

- **Identificador (ID):**
  - Tipo Java: `java.util.UUID` (`BaseAuditableEntity.java:32`).
  - Tipo en Base de Datos: `CHAR(36)` en MySQL (`@JdbcTypeCode(SqlTypes.CHAR)`). No se utilizan IDs numéricos incrementales.
- **Roles (`Role.java:11`):**
  - `STUDENT`: Alumno de la carrera / curso.
  - `PROFESSOR`: Docente habilitado vía whitelist o invitación.
  - `GESTOR`: Personal de gestión académica (administra profesores y gestores).
  - `ADMIN`: Administrador de la plataforma.
  - *Nota sobre rol `MS`:* El rol `MS` (Microservice) **no** pertenece al enum `Role` de usuarios persona; es exclusivo de los tokens de servicio M2M (`type: "service"`) emitidos por Client Credentials.
- **Estados de Cuenta (`AccountStatus.java:4-13`):**
  - `PENDING_EMAIL`: Cuenta recién registrada; bloqueada hasta verificar correo mediante enlace/token.
  - `PENDING_COURSE`: Correo validado; estudiante en espera de validación de curso (`courses.events`).
  - `ACTIVE`: Cuenta completamente habilitada y operativa en la plataforma.
  - `DEACTIVATED`: Cuenta desactivada lógicamente (`deleted_at != null`).

#### Tabla de Campos de la Entidad `User` (`users`)
| Campo Java | Columna SQL | Tipo SQL / Java | Nullable | Descripción / Rótulo | Archivo:Línea |
|---|---|---|---|---|---|
| `id` | `id` | `CHAR(36)` / `UUID` | No | Clave primaria UUID v4 | `BaseAuditableEntity.java:30` |
| `firstNames` | `first_names` | `VARCHAR(255)` / `String` | No | Nombres del titular | `User.java:52` |
| `lastNames` | `last_names` | `VARCHAR(255)` / `String` | No | Apellidos del titular | `User.java:55` |
| `legajo` | `legajo` | `VARCHAR(50)` / `String` | Sí | Número de legajo académico (alumnos/docentes) | `User.java:59` |
| `email` | `email` | `VARCHAR(255)` / `String` | No | Correo institucional (almacenado en minúsculas) | `User.java:62` |
| `passwordHash` | `password_hash` | `VARCHAR(255)` / `String` | No | Hash BCrypt (work factor 12) | `User.java:67` |
| `role` | `role` | `VARCHAR(20)` / `Role` | No | `STUDENT`, `PROFESSOR`, `GESTOR`, `ADMIN` | `User.java:72` |
| `accountStatus` | `account_status` | `VARCHAR(30)` / `AccountStatus` | No | `PENDING_EMAIL`, `PENDING_COURSE`, `ACTIVE`, `DEACTIVATED` | `User.java:77` |
| `emailVerified` | `email_verified` | `TINYINT(1)` / `boolean` | No | Indica si el email fue confirmado | `User.java:81` |
| `mustChangePassword` | `must_change_password` | `TINYINT(1)` / `boolean` | No | Fuerza cambio de clave en próximo login | `User.java:87` |
| `githubUsername` | `github_username` | `VARCHAR(39)` / `String` | Sí | Usuario GitHub verificado por OAuth | `User.java:91` |
| `avatarRef` | `avatar_ref` | `VARCHAR(255)` / `String` | Sí | URL o identificador del avatar | `User.java:95` |
| `firstLogin` | `first_login` | `TINYINT(1)` / `boolean` | No | `true` hasta completar tour y vinculación | `User.java:99` |
| `guidedTourCompleted`| `guided_tour_completed`| `TINYINT(1)` / `boolean`| No | Marca de tour guiado interactivo | `User.java:103` |
| `acceptedTermsVersion`| `terms_version_accepted`| `VARCHAR(20)` / `String`| No | Versión de términos aceptada (ej. `v1`) | `User.java:107` |
| `termsAcceptedAt` | `terms_accepted_at` | `DATETIME(6)` / `Instant` | No | Marca de tiempo de aceptación de términos | `User.java:111` |
| `createdAt` | `created_at` | `DATETIME(6)` / `Instant` | No | Timestamp de creación | `BaseAuditableEntity.java:35` |
| `updatedAt` | `updated_at` | `DATETIME(6)` / `Instant` | No | Timestamp de última actualización | `BaseAuditableEntity.java:52` |
| `deletedAt` | `deleted_at` | `DATETIME(6)` / `Instant` | Sí | Timestamp de baja lógica (`soft-delete`) | `BaseSoftDeletableEntity.java:20` |

---

### 1.2 Endpoints REST de `tpi-users` consumidos por el Frontend

Todos los endpoints son llamados por el Frontend Angular (`Frontend/2026-PIV-TPI-FE/src/app/core/config/api.config.ts:22-53` y `Frontend/2026-PIV-TPI-FE/src/app/core/auth/auth.service.ts:69-255`).

#### 1. Login Fase 1 (Validación de Credenciales)
- **Método y Path:** `POST /api/users/public/auth/login` (`AuthController.java:100`)
- **Acceso:** Público (anónimo)
- **Request Body (`LoginRequest`):**
  ```json
  {
    "email": "estudiante@frc.utn.edu.ar",
    "password": "Password123!"
  }
  ```
- **Response Status:** `200 OK`
- **Response Body (`LoginResponse`):**
  ```json
  {
    "challengeId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "message": "Credentials accepted. The code is sent by email."
  }
  ```
- *Nota técnica:* **No devuelve tokens**. Inicia el desafío 2FA y despacha el código por Kafka (`notifications.events`).

#### 2. Login Fase 2 (Verificación de 2FA y Emisión de Sesión)
- **Método y Path:** `POST /api/users/public/auth/2fa/verify` (`AuthController.java:126`)
- **Acceso:** Público (anónimo)
- **Request Body (`VerifyTwoFactorRequest`):**
  ```json
  {
    "challengeId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "code": "123456"
  }
  ```
- **Response Status:** `200 OK`
- **Response Body (`SessionResponse`):**
  ```json
  {
    "expiresIn": 600
  }
  ```
- **Headers `Set-Cookie` emitidos (`AuthController.java:171-172`, `SessionCookieService.java`):**
  ```http
  Set-Cookie: fu_at=<JWT_ACCESS_TOKEN>; Path=/; Max-Age=600; HttpOnly; SameSite=Strict
  Set-Cookie: fu_rt=<REFRESH_TOKEN_UUID>; Path=/api/users/public/auth; Max-Age=604800; HttpOnly; SameSite=Strict
  ```
  *(En entornos de desarrollo sin TLS, `COOKIE_SECURE=false` omite el flag `Secure` para permitir transporte en HTTP puro).*

#### 3. Refresh de Sesión (Rotación Proactiva / Silenciosa)
- **Método y Path:** `POST /api/users/public/auth/refresh` (`AuthController.java:156`)
- **Acceso:** Público (el refresh token viaja en la cookie `fu_rt`)
- **Request Body:** Vacío `{}`
- **Cookies esperadas:** `fu_rt=<UUID>`
- **Response Status:** `200 OK`
- **Response Body (`SessionResponse`):**
  ```json
  {
    "expiresIn": 600
  }
  ```
- **Headers `Set-Cookie` emitidos:** Nuevas cookies rotadas `fu_at` y `fu_rt`.

#### 4. Obtener Cuenta Propia (`/me`)
- **Método y Path:** `GET /api/users/me` (`UserController.java:72`)
- **Acceso:** Autenticado (exento de los tres gates perimetrales para permitir que el front sepa la razón de bloqueo).
- **Request Headers:** Cookie `fu_at` (o downstream `X-User-Id: <UUID>`, `X-User-Roles: <ROLES>`).
- **Response Status:** `200 OK`
- **Response Body (`UserMeResponse`, `UserMeResponse.java:8-13`):**
  ```json
  {
    "id": "c1f72922-e421-4f16-b52e-c76a9be77a91",
    "firstNames": "Juan",
    "lastNames": "Perez",
    "legajo": "84729",
    "email": "juan.perez@frc.utn.edu.ar",
    "role": "STUDENT",
    "accountStatus": "ACTIVE",
    "mustChangePassword": false,
    "firstLogin": false,
    "guidedTourCompleted": true,
    "githubUsername": "juanperez-dev",
    "avatarRef": null,
    "emailVerified": true,
    "createdAt": "2026-09-15T10:00:00Z",
    "termsAcceptedAt": "2026-09-15T10:05:00Z",
    "termsVersion": "v1"
  }
  ```

#### 5. Confirmación de Onboarding / Tour Guiado
- **Método y Path:** `PATCH /api/users/me/onboarding` (`UserController.java:95`)
- **Acceso:** Autenticado
- **Request Body (`OnboardingRequest`):**
  ```json
  {
    "tourOk": true
  }
  ```
- **Response Status:** `200 OK` (cuerpo vacío)

#### 6. Listado de Directorio de Usuarios (Admin / Gestor / Profesor)
- **Método y Path:** `GET /api/users` (`UserController.java:149`)
- **Acceso:** Roles `ADMIN`, `GESTOR`, `PROFESSOR`
- **Response Status:** `200 OK`
- **Response Body (`List<UserListItemResponse>`, `UserListItemResponse.java:22-24`):**
  ```json
  [
    {
      "id": "c1f72922-e421-4f16-b52e-c76a9be77a91",
      "firstNames": "Juan",
      "lastNames": "Perez",
      "legajo": "84729",
      "email": "juan.perez@frc.utn.edu.ar",
      "role": "STUDENT",
      "accountStatus": "ACTIVE",
      "createdAt": "2026-09-15T10:00:00Z"
    },
    {
      "id": "00000000-0000-0000-0000-000000000001",
      "firstNames": "Admin",
      "lastNames": "Inicial",
      "legajo": null,
      "email": "admin@frc.utn.edu.ar",
      "role": "ADMIN",
      "accountStatus": "ACTIVE",
      "createdAt": "2026-09-01T08:00:00Z"
    }
  ]
  ```

#### 7. Perfil Público de Terceros
- **Método y Path:** `GET /api/users/profile/{id}` (`UserController.java:132`)
- **Acceso:** Autenticado (`principal.isPerson() or hasAuthority('users.profile.read')`)
- **Response Status:** `200 OK`
- **Response Body (`ProfileResponse`, `ProfileResponse.java:23-25`):**
  ```json
  {
    "id": "c1f72922-e421-4f16-b52e-c76a9be77a91",
    "firstNames": "Juan",
    "lastNames": "Perez",
    "githubUsername": "juanperez-dev",
    "avatarRef": null,
    "email": null,
    "legajo": null,
    "accountStatus": null
  }
  ```
  *(Los campos `email`, `legajo` y `accountStatus` son `null` salvo que el solicitante tenga rol `ADMIN`).*

#### 8. Cierre de Sesión (Logout)
- **Método y Path:** `POST /api/users/auth/logout` (`AuthPrivateController.java:85`)
- **Acceso:** Autenticado
- **Response Status:** `200 OK` (cuerpo vacío)
- **Headers:** Limpia cookies `fu_at` y `fu_rt` con `Max-Age=0`.

#### 9. Registro de Estudiantes
- **Método y Path:** `POST /api/users/public/registration/student` (`RegistrationController.java:70`)
- **Acceso:** Público
- **Request Body (`StudentRegistrationRequest`):**
  ```json
  {
    "firstNames": "Maria",
    "lastNames": "Gomez",
    "legajo": "99123",
    "email": "maria.gomez@frc.utn.edu.ar",
    "password": "Password123!",
    "invitationCode": "INV-2026-UTN",
    "termsVersion": "v1"
  }
  ```
- **Response Status:** `200 OK`

#### 10. Claves Públicas de Verificación (JWKS RFC 7517)
- **Método y Path:** `GET /.well-known/jwks.json` (`JwksController.java:49`)
- **Acceso:** Público (consumido principalmente por el API Gateway)
- **Response Status:** `200 OK`
- **Response Body:**
  ```json
  {
    "keys": [
      {
        "kty": "RSA",
        "e": "AQAB",
        "use": "sig",
        "kid": "dev",
        "alg": "RS256",
        "n": "..."
      }
    ]
  }
  ```

---

## 2. Eventos Kafka Publicados por Users

Todos los eventos publicados por `users-service` utilizan el sobre canónico de la plataforma `EventEnvelope<T>` (`EventEnvelope.java:26-32`), persistido inicialmente en la tabla MySQL `outbox_events` mediante Transactional Outbox (`AccountEventPublisher.java:50-72`) y transmitido al broker por `OutboxPoller.java`.

### 2.1 Estructura Estándar del Envelope
```json
{
  "eventId": "a7b3b3fa-6d12-4211-8ce2-475b7b9f3f98",
  "eventType": "NOMBRE_DEL_EVENTO",
  "eventVersion": 1,
  "timestamp": "2026-10-03T18:00:00Z",
  "producer": "tema-01-users-service",
  "payload": { ... }
}
```

### 2.2 Catálogo de Tópicos y Eventos

#### Tópico: `users.events` (`users.kafka.topics.users-events: users.events`)
La clave del mensaje en Kafka (`messageKey`) es el `userId` en formato String.

##### 1. `STUDENT_REGISTERED`
- **Lanzado en:** `RegistrationService.java:320` tras confirmar activación del correo.
- **Payload (`StudentRegisteredPayload`, `RegistrationService.java:135`):**
  ```json
  {
    "eventId": "18cf784d-2e45-4df3-8d63-22ea6c3ef671",
    "eventType": "STUDENT_REGISTERED",
    "eventVersion": 1,
    "timestamp": "2026-10-03T18:05:00Z",
    "producer": "tema-01-users-service",
    "payload": {
      "userId": "c1f72922-e421-4f16-b52e-c76a9be77a91",
      "studentNumber": "84729",
      "invitationCode": "INV-2026-UTN"
    }
  }
  ```

##### 2. `TOUR_COMPLETED`
- **Lanzado en:** `UserService.java:206` cuando el usuario marca el tour completado.
- **Payload (`TourCompletedPayload`, `TourCompletedPayload.java:9`):**
  ```json
  {
    "eventId": "9bfa7c58-f5bc-4f76-80f0-8c2cb57053e1",
    "eventType": "TOUR_COMPLETED",
    "eventVersion": 1,
    "timestamp": "2026-10-03T18:10:00Z",
    "producer": "tema-01-users-service",
    "payload": {
      "userId": "c1f72922-e421-4f16-b52e-c76a9be77a91",
      "completedAt": "2026-10-03T18:10:00Z"
    }
  }
  ```

##### 3. `PROFILE_COMPLETED`
- **Lanzado en:** `GitProviderLinkService.java:192` al completar tour y vinculación de GitHub.
- **Payload (`ProfileCompletedPayload`, `ProfileCompletedPayload.java:9`):**
  ```json
  {
    "eventId": "3c988b47-6819-48fe-a28a-4421b2b63574",
    "eventType": "PROFILE_COMPLETED",
    "eventVersion": 1,
    "timestamp": "2026-10-03T18:12:00Z",
    "producer": "tema-01-users-service",
    "payload": {
      "userId": "c1f72922-e421-4f16-b52e-c76a9be77a91",
      "completedAt": "2026-10-03T18:12:00Z"
    }
  }
  ```

##### 4. `PASSWORD_CHANGED`
- **Lanzado en:** `PasswordService.java:192` en cambio voluntario o reseteo por enlace.
- **Payload (`PasswordChangedPayload`, `PasswordChangedPayload.java:11`):**
  ```json
  {
    "eventId": "472b53c1-0c30-4e2b-b461-8285514f7d23",
    "eventType": "PASSWORD_CHANGED",
    "eventVersion": 1,
    "timestamp": "2026-10-03T18:15:00Z",
    "producer": "tema-01-users-service",
    "payload": {
      "userId": "c1f72922-e421-4f16-b52e-c76a9be77a91",
      "changedAt": "2026-10-03T18:15:00Z",
      "trigger": "USER_CHANGE"
    }
  }
  ```

##### 5. `ACCOUNT_DEACTIVATED`
- **Lanzado en:** `UserService.java:328` tras baja lógica de cuenta.
- **Payload (`AccountDeactivatedPayload`, `UserService.java:101`):**
  ```json
  {
    "eventId": "887fa632-d17b-4ec5-9988-cb9ff0511874",
    "eventType": "ACCOUNT_DEACTIVATED",
    "eventVersion": 1,
    "timestamp": "2026-10-03T18:20:00Z",
    "producer": "tema-01-users-service",
    "payload": {
      "userId": "c1f72922-e421-4f16-b52e-c76a9be77a91",
      "role": "STUDENT",
      "deactivatedBy": "00000000-0000-0000-0000-000000000001",
      "deactivatedAt": "2026-10-03T18:20:00Z"
    }
  }
  ```

#### Tópico: `identity.audit.events` (`users.kafka.topics.identity-audit-events: identity.audit.events`)
- `ADMIN_BOOTSTRAP_CREATED` / `ADMIN_BREAKGLASS_RECOVERY` (`AdminAccountCreatedPayload.java:12`):
  `{ "userId": "...", "email": "admin@frc.utn.edu.ar" }`
- `ACCOUNT_CREATED_BY_ADMIN` (`AccountCreatedByAdminPayload.java:18`):
  `{ "userId": "...", "email": "...", "role": "ADMIN", "createdBy": "..." }`
- `ROLE_CHANGED` (`RoleChangedPayload.java:18`):
  `{ "userId": "...", "oldRole": "PROFESSOR", "newRole": "GESTOR", "changedBy": "..." }`
- `WHITELIST_ENTRY_ADDED` (`WhitelistEntryAddedPayload.java:18`):
  `{ "entryId": "...", "email": "...", "role": "PROFESSOR", "addedBy": "..." }`
- `WHITELIST_ENTRY_REMOVED` (`WhitelistEntryRemovedPayload.java:12`):
  `{ "entryId": "...", "removedBy": "..." }`
- `WHITELIST_REQUEST_RESOLVED` (`WhitelistRequestResolvedPayload.java:17`):
  `{ "requestId": "...", "requestedEmail": "...", "approved": true, "resolvedBy": "..." }`

#### Tópico: `notifications.events` (`users.kafka.topics.notifications-events: notifications.events`)
Eventos dirigidos al microservicio de notificaciones (`tema-11`) para envío de correos:
`EMAIL_2FA`, `EMAIL_ACCOUNT_ACTIVATION`, `EMAIL_RESET_PASSWORD`, etc.
Payload estándar (`NotificationEventPublisher.MailRequestedPayload`, `NotificationEventPublisher.java:33`):
```json
{
  "eventId": "59cb12fe-f458-4776-90a1-778899aabbcc",
  "eventType": "EMAIL_2FA",
  "eventVersion": 1,
  "timestamp": "2026-10-03T18:00:00Z",
  "producer": "tema-01-users-service",
  "payload": {
    "to": "estudiante@frc.utn.edu.ar",
    "variables": {
      "firstNames": "Juan",
      "code": "123456"
    }
  }
}
```

---

## 3. API Gateway (`tpi-api-gateway`)

### 3.1 Puertos y Exposición
- **Puerto de Aplicación (`server.port`):** `${SERVER_PORT:8080}` (`application.yml:287`).
- **Puerto de Gestión Actuator (`management.server.port`):** `${MANAGEMENT_PORT:8081}` (`application.yml:297`).
- **Puertos en Docker:** `expose: ["8080", "8081"]` (`docker-compose.yml:247`). No publica puertos en el host. El acceso externo se realiza exclusivamente a través de Nginx en el puerto 3000 (`docker-compose.yml:31`).

### 3.2 Tabla de Rutas (Path -> Servicio Eureka)
El enrutador dinámico (`AllowlistRouteLocator.java:45-69`) lee `gateway.routing.allowlist` (`GATEWAY_ALLOWLIST`) y remueve el sufijo `-service` para armar el path:
`Path = /api/{serviceId sin '-service'}/**` -> `lb://{serviceId}`

| Segmento Público | Path Entrante en Gateway | Destino en Eureka (URI) | Circuit Breaker Name | ¿Reescribe Path? |
|---|---|---|---|---|
| `users` | `/api/users/**` | `lb://users-service` | `users-service` | **No** (R7: path intacto) |
| `notifications` | `/api/notifications/**` | `lb://notifications-service` | `notifications-service` | **No** |
| `course` | `/api/course/**` | `lb://course-service` | `course-service` | **No** |
| `llm` | `/api/llm/**` | `lb://llm-service` | `llm-service` | **No** |
| `theoretical-challenge`| `/api/theoretical-challenge/**`| `lb://theoretical-challenge-service`| `theoretical-challenge-service`| **No** |
| `accounting` | `/api/accounting/**` | `lb://accounting-service` | `accounting-service` | **No** |
| `sandbox` | `/api/sandbox/**` | `lb://sandbox-service` | `sandbox-service` | **No** |
| `practical-challenge`| `/api/practical-challenge/**`| `lb://practical-challenge-service`| `practical-challenge-service`| **No** |
| `engine-challenge` | `/api/engine-challenge/**` | `lb://engine-challenge-service` | `engine-challenge-service` | **No** |
| `roadmap` | `/api/roadmap/**` | `lb://roadmap-service` | `roadmap-service` | **No** |
| `backoffice` | `/api/backoffice/**` | `lb://backoffice-service` | `backoffice-service` | **No** |
| `market` | `/api/market/**` | `lb://market-service` | `market-service` | **No** |
| *Ruta Estática JWKS* | `/.well-known/jwks.json` | `lb://users-service` | `users-service` | **No** (`application.yml:77-86`) |
| *OpenAPI UI* | `/api/docs/ui` | Interno Netty WebFlux | N/A | Atendido por Swagger UI agregado |

### 3.3 Validación de JWT y Filtros de Seguridad

#### Algoritmo y Verificación Criptográfica (`SecurityConfig.java:49-63`)
- **Algoritmo:** `RS256` (`SignatureAlgorithm.RS256`).
- **Proveedor de Claves (JWKS):** Descarga dinámica reactiva desde `spring.security.oauth2.resourceserver.jwt.jwk-set-uri: ${JWKS_URI}` (apuntando a `http://users-service:8082/.well-known/jwks.json`).
- **Validadores del Token:**
  1. `JwtTimestampValidator`: Valida `exp`, `nbf` e `iat`.
  2. `IssuerValidator`: Valida que el claim `iss` sea idéntico a `gateway.jwt.expected-issuer` (`users-service`).

#### Transporte del Token (`CookieOrHeaderBearerConverter.java:18-50` y `PrivateRouteGuard.java:119-128`)
Existe una política estricta de transporte según el tipo de principal:
- **Tokens de Usuario Persona (`type: "user"`):**
  - **Obligatorio:** Deben llegar en la Cookie HttpOnly `fu_at`.
  - Si un token de persona llega en el header `Authorization: Bearer <token>`, el Gateway lo **rechaza de inmediato** con HTTP 401 (`reason=person-via-header`) (`PrivateRouteGuard.java:122`).
- **Tokens de Servicio M2M (`type: "service"`):**
  - **Obligatorio:** Deben llegar en el header `Authorization: Bearer <token>`.
  - Deben contener el rol `"MS"` en el claim `roles` (`PrivateRouteGuard.java:115`).
  - Si un token de servicio llega vía cookie, se rechaza con HTTP 401 (`reason=service-via-cookie`).

#### Validación de Sesión en Redis (`SessionGuard.java:30-70`, `SessionValidator.java:67-94`)
- Para tokens de persona (`type: "user"`), el Gateway extrae el claim `sid` (session ID) y consulta de forma no bloqueante la clave Redis:
  `session:{userId}` (donde `{userId}` es el claim `sub`).
- **Regla:** El valor almacenado en Redis debe coincidir exactamente con el claim `sid` del token.
  - Si coincide -> sesión `VALID`.
  - Si difiere -> rechazo HTTP 401 (`reason=session-superseded`).
  - Si la clave no existe en Redis -> rechazo HTTP 401 (`reason=session-closed`).
  - Si Redis no responde (timeout 500ms) -> rechazo HTTP 503 (`reason=unverifiable`, fail-closed con `Retry-After: 5s`).
- Para tokens de servicio (`type: "service"`), **no** se consulta Redis; se aceptan directamente si la firma y el claim `aud` son válidos.

#### Control Perimetral de Estado de Cuenta (`AccountStateGuard.java:69-120`)
Para usuarios persona en rutas privadas, se evalúan 3 claims obligatorios:
1. `est`: Debe ser `"ACTIVE"`.
2. `pwd`: Debe ser `false` (no requiere cambio forzado de contraseña).
3. `onb`: Debe ser `false` (no tiene onboarding pendiente).
Si alguno no cumple la condición, el Gateway bloquea el acceso con HTTP 403 Forbidden (`type: pending-account`, `password-change-required` u `onboarding-pending`), salvo que el path coincida con `gateway.account-gate.exempt-prefixes` (`/api/users/**`).

### 3.4 Propagación de Identidad y Headers Downstream (`IdentityPropagationFilter.java:51-89`)

El Gateway implementa un estricto mecanismo de **Anti-Spoofing en 2 pasos**:
1. **Paso 1 (Strip incondicional):** Remueve los 5 headers reservados de toda solicitud entrante (incluso rutas anónimas):
   - `X-Principal-Type`
   - `X-User-Id`
   - `X-User-Roles`
   - `X-Service-Id`
   - `X-Service-Scopes`
2. **Paso 2 (Inyección confiable):** Inyecta headers derivados exclusivamente del JWT validado:

#### Formato para Usuario Persona (`type: "user"`):
```http
X-Principal-Type: user
X-User-Id: c1f72922-e421-4f16-b52e-c76a9be77a91
X-User-Roles: STUDENT
X-Request-Id: 98f1c0d4-1a5e-44d5-91f1-ec0ef633d712
```
*Formato de roles:* Lista separada por comas **sin espacios** (`PrincipalContext.java:60`). Ejemplo: `STUDENT` o `ADMIN,GESTOR`. En los microservicios downstream (ej. `tpi-roadmap`), `GatewayHeadersFilter` agrega automáticamente el prefijo `ROLE_` resultando en autoridades de Spring Security: `ROLE_STUDENT`, `ROLE_ADMIN`, etc.

#### Formato para Servicio M2M (`type: "service"`):
```http
X-Principal-Type: service
X-Service-Id: course-service
X-Service-Scopes: MS,course.enrollment.read
X-Request-Id: 98f1c0d4-1a5e-44d5-91f1-ec0ef633d712
```
*Formato de scopes:* El rol `MS` primero, seguido de los scopes separados por comas (`PrincipalContext.java:65`).

### 3.5 CORS en el Gateway
- **Configuración de CORS:** **No configurado** (`SecurityConfig.java:78-87` no define bloque `cors()`; `application.yml` no contiene `globalcors`).
- **Razón arquitectónica (`api.config.ts:9`):** El frontend y la API comparten el mismo origen a través del Reverse Proxy Nginx en `:3000` (o Tailscale Mesh). Al ser Same-Origin, el navegador no realiza requests de preflight `OPTIONS` y no requiere cabeceras CORS.

---

## 4. Eureka (Service Discovery)

Configuración extraída de `Backend/_integracion/tpi-system-compose/docker-compose.yml:62-75`:
- **Imagen Docker:** `steeltoeoss/eureka-server:4.1.1`
- **Contenedor:** `eureka`
- **Puerto Host / Contenedor:** `127.0.0.1:8761:8761`
- **Healthcheck:**
  `wget -qO- --timeout=3 http://127.0.0.1:8761/actuator/health | grep -q UP`
- **Red Docker:** `tpi-users`
- **Límite de Memoria:** `384M`
- **URL de Registro para Microservicios:**
  `http://eureka:8761/eureka/` (variable `EUREKA_URL`)
- **Dashboard / API de Consulta:**
  - UI Web: `http://localhost:8761/`
  - Instancias registradas (XML/JSON): `http://localhost:8761/eureka/apps`
- **Comportamiento en clientes Spring:**
  - Microservicios downstream registran su nombre (`spring.application.name`) y reportan estado via Actuator Healthcheck (`eureka.client.healthcheck.enabled=true`).
  - Solo el API Gateway tiene habilitada la descarga activa del registro (`eureka.client.fetch-registry=true`). Los microservicios de negocio tienen `fetch-registry=false`.

---

## 5. Kafka (Event Bus)

Configuración extraída de `Backend/_integracion/tpi-system-compose/docker-compose.yml:132-185`:
- **Imagen Docker:** `apache/kafka:4.1.0`
- **Contenedor:** `event-bus`
- **Modo de Operación:** **KRaft** (Kafka Raft Metadata mode, **sin Apache ZooKeeper**).
  - Variables KRaft:
    - `KAFKA_NODE_ID: 1`
    - `KAFKA_PROCESS_ROLES: broker,controller`
    - `KAFKA_CONTROLLER_QUORUM_VOTERS: 1@event-bus:9093`
- **Listeners y Puertos:**
  - Interno Docker: `PLAINTEXT://:29092` (anunciado como `PLAINTEXT://event-bus:29092`)
  - Externo Host: `PLAINTEXT_HOST://:9094` (anunciado como `PLAINTEXT_HOST://localhost:9094`, mapeado a `127.0.0.1:9094:9094`)
  - Mesh VPN Tailscale: `TAILNET://:9092` (anunciado como `TAILNET://${MESH_ADDRESS:-tpi-plataforma.tail767776.ts.net}:9092`)
  - Quorum Controller KRaft: `CONTROLLER://:9093`
- **Auto-creación de tópicos:** Desactivada (`KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"`).
- **Inicializador de Tópicos (`kafka-init`):** Ejecuta periódicamente (`RECONCILE_INTERVAL_SECONDS: 60`) el script `event-bus/init-topics.sh`.

### Lista Completa de Tópicos Declarados (`event-bus/init-topics.sh:7-36`)
Todos los tópicos de dominio se crean con **3 particiones** y **factor de replicación 1**:

1. `courses.events`
2. `courses.events.DLT`
3. `challenges.events`
4. `challenges.events.DLT`
5. `llm.events`
6. `llm.events.DLT`
7. `chat.events`
8. `chat.events.DLT`
9. `notifications.events`
10. `notifications.events.DLT`
11. `market.events`
12. `market.events.DLT`
13. `sandbox.events`
14. `sandbox.events.DLT`
15. `users.events`
16. `users.events.DLT`
17. `identity.audit.events`
18. `identity.audit.events.DLT`
19. `administration.events`
20. `administration.events.DLT`
21. `accounting.events`
22. `accounting.events.DLT`
23. `mail.events.retry.short`
24. `mail.events.retry.standard`
25. `mail.events.retry.quota`
26. `mail.events.dlt`

---

## 6. Propuesta Mínima para Simular Login sin Validaciones en el Mock Stack

### 6.1 Requisitos del Frontend y del Gateway

Para que el Frontend Angular (`Frontend/2026-PIV-TPI-FE`) y el microservicio `tpi-roadmap` funcionen sin levantar la base MySQL con las 80 migraciones de Flyway ni el servicio completo de `tpi-users`, existen dos alternativas de diseño:

---

### Opción A (Recomendada): Mock Users Service + API Gateway Real + Redis + Eureka Simple

Esta opción conserva el `api-gateway` y `eureka` oficiales, garantizando que los filtros perimetrales y los headers inyectados downstream sean **100% idénticos a producción**.

#### Componentes del Mock Stack:
1. **Eureka:** Contenedor `steeltoeoss/eureka-server:4.1.1` en `:8761`.
2. **Redis:** Contenedor `redis:7.4-alpine` en `:6379`.
3. **API Gateway:** Contenedor `api-gateway` oficial.
4. **Mock Users Service (ej. Node.js Express / Python FastAPI / WireMock / Go):**
   - Registrado en Eureka como `USERS-SERVICE` (puerto 8082).
   - Genera un par de claves RSA (2048 bits) en memoria o en archivo al iniciar.
   - **Endpoint 1: JWKS (`GET /.well-known/jwks.json`):**
     Devuelve la clave pública RSA:
     ```json
     {
       "keys": [
         {
           "kty": "RSA",
           "e": "AQAB",
           "use": "sig",
           "kid": "dev",
           "alg": "RS256",
           "n": "<MODULUS_BASE64URL>"
         }
       ]
     }
     ```
   - **Endpoint 2: Login (`POST /api/users/public/auth/login`):**
     Acepta cualquier credencial y responde:
     ```json
     {
       "challengeId": "mock-challenge-uuid",
       "message": "Credentials accepted."
     }
     ```
   - **Endpoint 3: 2FA Verify (`POST /api/users/public/auth/2fa/verify`):**
     1. Acepta cualquier código (ej. `"123456"`).
     2. Genera un token JWT RS256 con las siguientes claims requeridas por el Gateway:
        ```json
        {
          "iss": "users-service",
          "sub": "c1f72922-e421-4f16-b52e-c76a9be77a91",
          "roles": ["STUDENT"],
          "type": "user",
          "sid": "session-mock-1234",
          "est": "ACTIVE",
          "pwd": false,
          "onb": false,
          "jti": "d3b07384-d113-4f9e-b83c-1b7713837943",
          "iat": 1759510000,
          "exp": 1759596400
        }
        ```
     3. Escribe en Redis la clave de sesión:
        `SET session:c1f72922-e421-4f16-b52e-c76a9be77a91 session-mock-1234`
     4. Devuelve respuesta HTTP:
        - Status: `200 OK`
        - Headers:
          ```http
          Set-Cookie: fu_at=<JWT_FIRMADO>; Path=/; HttpOnly; SameSite=Strict
          Set-Cookie: fu_rt=e1f72922-e421-4f16-b52e-c76a9be77a99; Path=/api/users/public/auth; HttpOnly; SameSite=Strict
          ```
        - Body:
          ```json
          {
            "expiresIn": 86400
          }
          ```
   - **Endpoint 4: Current User (`GET /api/users/me`):**
     Devuelve los datos del estudiante:
     ```json
     {
       "id": "c1f72922-e421-4f16-b52e-c76a9be77a91",
       "firstNames": "Estudiante",
       "lastNames": "Demo",
       "legajo": "12345",
       "email": "demo@frc.utn.edu.ar",
       "role": "STUDENT",
       "accountStatus": "ACTIVE",
       "mustChangePassword": false,
       "firstLogin": false,
       "guidedTourCompleted": true,
       "githubUsername": "demo-student",
       "avatarRef": null,
       "emailVerified": true,
       "createdAt": "2026-09-01T00:00:00Z",
       "termsAcceptedAt": "2026-09-01T00:00:00Z",
       "termsVersion": "v1"
     }
     ```
   - **Endpoint 5: Refresh (`POST /api/users/public/auth/refresh`):**
     Devuelve `{ "expiresIn": 86400 }` renovando la cookie `fu_at`.

---

### Opción B: Proxy Inverso Ligero (Nginx o Node Mock Gateway) sin Eureka ni Redis

Si se desea un mock stack ultraliviano que no ejecute Java para el Gateway ni Redis:
1. Se expone un Nginx o Node.js Proxy en el puerto 3000 (el mismo origen que espera el front).
2. Para rutas `/api/users/**`: Responde con los JSONs estáticos descriptos arriba.
3. Para rutas `/api/roadmap/**`:
   Inyecta directamente las cabeceras downstream que espera `tpi-roadmap` (`GatewayHeadersFilter.java:49-59`):
   ```http
   X-Principal-Type: user
   X-User-Id: c1f72922-e421-4f16-b52e-c76a9be77a91
   X-User-Roles: STUDENT
   X-Request-Id: 98f1c0d4-1a5e-44d5-91f1-ec0ef633d712
   ```
   Y reenvía la petición al contenedor de `tpi-roadmap:8010`.

#### Conclusión comparativa para el Mock Stack:
- La **Opción A** garantiza que se pruebe la compatibilidad real del Frontend y del Gateway oficial con el flujo de cookies `fu_at`, validación de issuer, y expiración de tokens.
- La **Opción B** es útil para desarrollo rápido y pruebas de unidad/integración del grafo de roadmap sin dependencias de Spring Cloud ni Redis.
