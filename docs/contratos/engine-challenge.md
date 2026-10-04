# Contrato de Servicio: engine-challenge-service (Tema 03 — Catálogo de Desafíos y Simulador de Cierre)

> Grupo 10 · Mock Stack `tpi-roadmap-mocks`  
> Documento de fidelidad contractual según reglas R2, R6 y R14 de `IMPLEMENTACION.md`.

## 1. Identidad y Metadatos de Infraestructura

- **Nombre en Eureka:** `engine-challenge-service`
- **Puerto interno:** `8096`
- **Prefijo en API Gateway:** `/api/engine-challenge/**`
- **Tópico Kafka de Cierre:** `challenges.events`
- **Producer Kafka:** `"THEME-02-CHALLENGE-ENGINE"` (exacto; RoadmapEventListener descarta otros productores)
- **Key Kafka:** `id_user` (string UUID del estudiante)
- **EventVersion:** `1` (entero obligatorio según R6 y EventParser.java)

---

## 2. Fuentes Contractuales Analizadas

1. **Frontend Angular (`Frontend/2026-PIV-TPI-FE`):**
   - Repositorio: `Frontend/2026-PIV-TPI-FE` @ `origin/develop` (`f70c508f8a7e1758a3b6c2486729a0ba8fd42c71`)
   - `src/app/features/challenges/types/challenge-response.ts:1-108`:
     - `Challenge` (id, authorId, type, status, incomplete, currentVersion, title, description, difficulty, mandatory, retries, approvalThreshold, contentReference, createdAt).
     - `ChallengeResponse` (content, page, size, totalElements, totalPages).
     - `StartAttemptRequest` (courseId, nodeId, attemptType) y `StartAttemptResponse` (attemptId, challengeId, status).
     - `CreateChallengeRequest`, `UpdateChallengeRequest`, `UpdateChallengeStatusRequest`, `ChallengeVersion`.
   - `src/app/features/challenges/data-access/challenges.service.ts:1-180`:
     - Invocaciones Angular vía `/engine-challenge/challenges` (`/api/engine-challenge/challenges` por el proxy).
     - `getOwnChallenges` (paginación y filtros: status, type, difficulty, includeArchived).
     - `getChallengeById`, `getChallengeVersions`, `createChallenge`, `startAttempt`, `updateChallenge`, `deleteChallenge`, `updateChallengeStatus` (`PATCH /.../{id}/estado`).

2. **Consumidor Roadmap (`Backend/tpi-roadmap`):**
   - Repositorio: `Backend/tpi-roadmap` @ `develop` (`02c14b9ba633d3610b9c90d696c84db32253cf80`)
   - `src/main/java/com/utn/tpi/roadmap/clients/motor/HttpMotorCatalogClient.java:60-105`:
     - `existsChallenge(challengeId)`: realiza `GET /api/engine-challenge/challenges/{challengeId}` con token técnico bearer. Responde 200 (existe) o 404 (desconocido).
     - `fetchPublishedChallenges()`: `GET /api/engine-challenge/challenges?status=PUBLISHED&page=0&size=50` esperando `{ content: [ { id, type, status, title } ] }`.
   - `src/main/java/com/utn/tpi/roadmap/clients/motor/MotorCatalogProperties.java:28-40`:
     - Defaults: `existsPath = "/api/engine-challenge/challenges/{challengeId}"`, `poolPath = "/api/engine-challenge/challenges"`.
   - `src/main/java/com/utn/tpi/roadmap/demo/DemoData.java:39,49-67`:
     - Formato de IDs: `40000000-0000-4000-8000-%012d`.
     - 11 desafíos sembrados en las 3 secciones con sus tipos (`THEORETICAL_CHALLENGE`, `PRACTICAL_CHALLENGE`), dificultades (`BASIC`, `MEDIUM`, `ADVANCED`), XP base y obligatoriedad.
   - `src/main/java/com/utn/tpi/roadmap/events/ChallengeClosurePayload.java:42-175`:
     - Payload del evento de cierre v3.
     - `resources`: `{ coins: Double, xp: Long, add_live: Boolean, subtract_live: Boolean, active_item: List<String> }`.
     - `result`: `{ status: AttemptStatus (APPROVED | DISAPPROVE), score: Integer, completedAt: Instant, late: Boolean, attempt_number: Integer, resolution_time: Double, startedAt: Instant, submittedAt: Instant, approval_threshold: Integer, max_attempts: Integer, last_attempt: Boolean, closure_reason: AbortReason, closure_detail: String }`.
     - `isComplete()` exige: `idUser != null`, `idCourse != null`, `challengeId != null`, `resources != null`, `resources.xp != null`, `result != null`.
   - `src/main/java/com/utn/tpi/roadmap/events/EventParser.java:51-107`:
     - Valida `eventId` (UUID), `eventType` (SCREAMING_SNAKE_CASE), `eventVersion == 1` (entero estricto, sin floats ni strings), `timestamp` (ISO-8601 con offset UTC 'Z'), `producer`, y `payload`.
   - `src/main/java/com/utn/tpi/roadmap/events/RoadmapEventListener.java:43-71,159-224`:
     - `@KafkaListener` en `challenges.events`.
     - Filtra productor exacto: `CHALLENGE_ENGINE_PRODUCER = "THEME-02-CHALLENGE-ENGINE"`.
     - Deserializa `ChallengeClosurePayload`. En `CHALLENGE_COMPLETED` requiere `result.status != null` y toma `passed = (status == APPROVED)`.
     - Registra `ChallengeResult(idCourse, idUser, challengeId, xp, false, passed, idNode)` en el ledger de progreso.
     - En `CHALLENGE_ABORTED` loguea el aborto sin impacto en XP/progreso.
   - `docs/contracts/motor-desafios-evento-cierre.md`:
     - Contrato acordado del evento de cierre. Topic `challenges.events`, key `id_user`, `producer = "THEME-02-CHALLENGE-ENGINE"`.

---

## 3. Endpoints Expuestos

| Método | Path | Request Body / Query | Response Body | Status | Contexto / Consumidor |
|---|---|---|---|---|---|
| `GET` | `/api/engine-challenge/challenges` | Query: `page`, `size`, `status`, `type`, `difficulty`, `includeArchived` | `ChallengeResponse` (paginado) | 200 | Front (catálogo docente) y Roadmap (`fetchPublishedChallenges`). |
| `GET` | `/api/engine-challenge/challenges/{id}` | — | `Challenge` | 200 / 404 | Front y Roadmap (`existsChallenge`). 404 si no existe. |
| `POST` | `/api/engine-challenge/challenges` | `CreateChallengeRequest` | `Challenge` | 201 | Creación de desafío. Nace `PUBLISHED` para disponibilidad inmediata. |
| `PUT` | `/api/engine-challenge/challenges/{id}` | `UpdateChallengeRequest` | `Challenge` | 200 / 404 | Edición del desafío; incrementa `currentVersion`. |
| `DELETE` | `/api/engine-challenge/challenges/{id}` | — | — | 204 / 404 | Eliminación de desafío. |
| `PATCH` | `/api/engine-challenge/challenges/{id}/status` | `{ status }` | `Challenge` | 200 / 404 | Actualización de estado del ciclo de vida. |
| `PATCH` | `/api/engine-challenge/challenges/{id}/estado` | `{ status }` | `Challenge` | 200 / 404 | Alias para compatibilidad con `challenges.service.ts` del front. |
| `GET` | `/api/engine-challenge/challenges/{id}/versiones` | — | `[]` | 200 / 404 | Historial de versiones (mock devuelve array vacío). |
| `POST` | `/api/engine-challenge/challenges/{id}/intentos` | `{ courseId, nodeId, attemptType }` | `{ attemptId, challengeId, status: "IN_PROGRESS" }` | 201 / 404 | Apertura de intento por el estudiante. Extrae `studentId` de `identity`. |

---

## 4. Endpoints Exclusivos del Mock (R3)

| Método | Path | Request Body | Response Body | Propósito |
|---|---|---|---|---|
| `GET` | `/api/engine-challenge/mock/ping` | — | `{ service, ok: true }` | Liveness y health check. |
| `GET` | `/api/engine-challenge/mock/echo` | — | Headers recibidos | Diagnóstico de cabeceras inyectadas por el Gateway (`X-User-*`). |
| `GET` | `/api/engine-challenge/mock/attempts` | — | `Attempt[]` | Listado de intentos en memoria para el panel de control. |
| `POST` | `/api/engine-challenge/mock/attempts/{attemptId}/close` | `{ approved, score?, xp? }` | Envelope Kafka | Cierre de intento existente: publica `CHALLENGE_COMPLETED` en `challenges.events`. |
| `POST` | `/api/engine-challenge/mock/attempts/{attemptId}/abort` | `{ reason?, detail? }` | Envelope Kafka | Aborto de intento existente: publica `CHALLENGE_ABORTED` en `challenges.events`. |
| `POST` | `/api/engine-challenge/mock/close` | `{ studentId, courseId, challengeId, nodeId?, approved, score?, xp?, eventId? }` | Envelope Kafka | Cierre directo sin intento previo (para scripts, curl e idempotencia). |
| `POST` | `/api/engine-challenge/mock/fault` | `{ status, delayMs, pathPrefix, times }` | `{ ok: true, fault }` | Inyección de fallas y latencia (provisto por `lib/http.mjs`). |
| `DELETE` | `/api/engine-challenge/mock/fault` | — | `{ ok: true, cleared: true }` | Limpieza de fallas simuladas. |

*Nota:* Los endpoints también admiten su llamada directa en el contenedor sin el prefijo `/api/engine-challenge` (ej: `/mock/attempts`), garantizando compatibilidad con cualquier invocador.

---

## 5. Eventos Kafka Publicados

Tópico: **`challenges.events`**  
Key: **`id_user`** (UUID en string)  
Producer: **`THEME-02-CHALLENGE-ENGINE`**  
EventVersion: **`1`** (entero estricto)  

### A. Evento `CHALLENGE_COMPLETED`

Publicado al cerrar un intento (aprobado o reprobado).

```json
{
  "eventId": "7a3e813f-b88c-4cf2-9e8a-0d8591ef528c",
  "eventType": "CHALLENGE_COMPLETED",
  "eventVersion": 1,
  "timestamp": "2026-10-03T19:40:00.000Z",
  "producer": "THEME-02-CHALLENGE-ENGINE",
  "payload": {
    "resources": {
      "coins": 100.0,
      "xp": 250,
      "add_live": false,
      "subtract_live": false,
      "active_item": []
    },
    "id_user": "30000000-0000-4000-8000-000000000001",
    "id_course": "10000000-0000-4000-8000-000000000001",
    "id_node": "5d2a7c10-3e4f-4a5b-9c6d-7e8f90a1b2c3",
    "id_attempt": "e1582fc8-12c8-4770-bc56-02f4a13d7821",
    "challenge_id": "40000000-0000-4000-8000-000000000002",
    "challenge_version": 1,
    "challenge_type": "NORMAL",
    "content_type": "PRACTICAL",
    "difficulty": "MEDIUM",
    "mandatory": true,
    "performed_by_user_id": "30000000-0000-4000-8000-000000000001",
    "performed_by_role": "STUDENT",
    "result": {
      "status": "APPROVED",
      "score": 85,
      "completedAt": "2026-10-03T19:40:00.000Z",
      "late": false,
      "attempt_number": 1,
      "resolution_time": 120.0,
      "startedAt": "2026-10-03T19:38:00.000Z",
      "submittedAt": "2026-10-03T19:40:00.000Z",
      "approval_threshold": 60,
      "max_attempts": 3,
      "last_attempt": false,
      "closure_reason": null,
      "closure_detail": null
    }
  }
}
```

#### Reglas de cálculo y valores:
- `result.status`: `"APPROVED"` o `"DISAPPROVE"` (**literal sin 'D' final**, según contrato e `AttemptStatus.java`).
- `resources.xp`: Entero. Si no se especifica, por defecto:
  - `BASIC` / `EASY`: `100`
  - `MEDIUM`: `250`
  - `ADVANCED` / `HARD`: `500`
  - Desaprobado (`DISAPPROVE`): `0`
- `difficulty` en payload: Mapeado a la escala de Roadmap (`BASIC -> EASY`, `MEDIUM -> MEDIUM`, `ADVANCED -> HARD`).
- `resources.coins`: `100.0` si está aprobado, `0.0` si está desaprobado (formato decimal).
- `resources.subtract_live`: `true` si `!approved`, `false` si está aprobado.
- `resources.add_live`: `false` para tipo `NORMAL`.

---

### B. Evento `CHALLENGE_ABORTED`

Publicado al cancelar o anular un intento.

```json
{
  "eventId": "3c98863f-67db-45f8-8bb8-f58c704e9c71",
  "eventType": "CHALLENGE_ABORTED",
  "eventVersion": 1,
  "timestamp": "2026-10-03T19:40:00.000Z",
  "producer": "THEME-02-CHALLENGE-ENGINE",
  "payload": {
    "resources": {
      "coins": 0.0,
      "xp": 0,
      "add_live": false,
      "subtract_live": false,
      "active_item": []
    },
    "id_user": "30000000-0000-4000-8000-000000000001",
    "id_course": "10000000-0000-4000-8000-000000000001",
    "id_node": "5d2a7c10-3e4f-4a5b-9c6d-7e8f90a1b2c3",
    "id_attempt": "a4b5c6d7-1111-4222-8333-944455556666",
    "challenge_id": "40000000-0000-4000-8000-000000000001",
    "challenge_version": 1,
    "challenge_type": "NORMAL",
    "content_type": "THEORETICAL",
    "difficulty": "EASY",
    "mandatory": true,
    "performed_by_user_id": "2db91e4f-a408-4b4f-85ec-a68804984cad",
    "performed_by_role": "PROFESSOR",
    "result": {
      "status": null,
      "score": null,
      "completedAt": "2026-10-03T19:40:00.000Z",
      "late": false,
      "attempt_number": 1,
      "resolution_time": 120.0,
      "startedAt": "2026-10-03T19:38:00.000Z",
      "submittedAt": null,
      "approval_threshold": 60,
      "max_attempts": 3,
      "last_attempt": false,
      "closure_reason": "CANCELLED",
      "closure_detail": "Cancelado vía simulador mock"
    }
  }
}
```

#### Reglas de valores en aborto:
- `result.status`: `null` (obligatorio para `CHALLENGE_ABORTED`).
- `result.score`: `null`.
- `resources.xp`: `0`.
- `resources.coins`: `0.0`.
- `resources.subtract_live`: `false`.
- `result.closure_reason`: `"CANCELLED"`, `"EXPIRED"` o `"ABANDONED"` (según `AbortReason.java`).

---

## 6. Catálogo Sembrado (11 Desafíos Demo)

Todos pertenecen al autor docente `2db91e4f-a408-4b4f-85ec-a68804984cad` y nacen con estado `PUBLISHED`.

| # | ID Fijo | Título | Tipo | Dificultad | Mandatory | XP Base |
|---|---|---|---|---|---|---|
| 1 | `40000000-0000-4000-8000-000000000001` | Variables y tipos | THEORETICAL | BASIC | `true` | 100 |
| 2 | `40000000-0000-4000-8000-000000000002` | Estructuras de control | PRACTICAL | MEDIUM | `true` | 250 |
| 3 | `40000000-0000-4000-8000-000000000003` | Mini proyecto | PRACTICAL | ADVANCED | `false` | 500 |
| 4 | `40000000-0000-4000-8000-000000000004` | Recuperación de vida | PRACTICAL | BASIC | `false` | 100 |
| 5 | `40000000-0000-4000-8000-000000000005` | Clases y objetos | THEORETICAL | MEDIUM | `true` | 250 |
| 6 | `40000000-0000-4000-8000-000000000006` | Herencia y polimorfismo | THEORETICAL | MEDIUM | `false` | 250 |
| 7 | `40000000-0000-4000-8000-000000000007` | Modelado de dominio | PRACTICAL | ADVANCED | `true` | 500 |
| 8 | `40000000-0000-4000-8000-000000000008` | Refactor guiado | PRACTICAL | ADVANCED | `false` | 500 |
| 9 | `40000000-0000-4000-8000-000000000009` | Listas y mapas | THEORETICAL | MEDIUM | `true` | 250 |
| 10 | `40000000-0000-4000-8000-000000000010` | Acceso a datos | PRACTICAL | ADVANCED | `true` | 500 |
| 11 | `40000000-0000-4000-8000-000000000011` | Proyecto integrador | PRACTICAL | ADVANCED | `false` | 500 |
