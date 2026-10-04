# tpi-roadmap — Contratos, Interfaces y Dependencias Externas

> **Fecha:** 2026-10-03  
> **Microservicio:** `roadmap-service` (Grupo 10 · Tema 10)  
> **Código base analizado:** `Backend/tpi-roadmap`  
> **Frontend analizado:** `Frontend/2026-PIV-TPI-FE`  
> **Propósito:** Documento de referencia técnico y contrato ejecutable para la construcción del **Mock Stack** dockerizado (Gateway + Eureka, Users fake, Courses fake con desafíos, Kafka, simulador de XP y Accounting/Inventario).  
> **Criterio:** Todo dato proviene del código fuente con cita estricta `archivo:línea`. Si una funcionalidad no existe en el código, se indica explícitamente como `no encontrado`.

---

## 1. Consumidores Kafka de Roadmap

Roadmap cuenta con un contenedor de listeners tipado sobre un envelope genérico `EventEnvelope<JsonNode>` gestionado por `KafkaConsumerConfig.java:62-95`.

### 1.1 Configuración de Deserialización y Transporte

- **Bootstrap Servers:** `${KAFKA_BOOTSTRAP:${KAFKA_SERVERS:localhost:29092}}` (`src/main/resources/application.properties:124`).
- **Consumer Group ID:** `roadmap-service` (`application.properties:125`).
- **Auto Offset Reset:** `earliest` (`application.properties:126`).
- **Key Deserializer:** `org.apache.kafka.common.serialization.StringDeserializer` (`application.properties:127`).
- **Value Deserializer:** `org.springframework.kafka.support.serializer.ErrorHandlingDeserializer` (`application.properties:131`).
- **Delegate Class:** `com.utn.tpi.roadmap.events.EventEnvelopeDeserializer` (`application.properties:132`).
- **Trusted Packages:** `com.utn.tpi.roadmap.*` (`application.properties:133`).
- **Concurrencia:** `${KAFKA_CONCURRENCY:3}` (`application.properties:134`).
- **Manejo de Errores y Reintentos:**
  - Backoff exponencial: intervalo inicial 1.000 ms, multiplicador 2.0, máximo 30.000 ms, tiempo total límite 120.000 ms (`KafkaConsumerConfig.java:33-43, 103-108`).
  - Errores no reintentables (el offset avanza y se loguea/envía a DLQ sin retentar): `NonRetryableEventException` y `DeserializationException` (`KafkaConsumerConfig.java:58`).
  - DLQ: `${app.kafka.topics.dlq:}` (`application.properties:142`). Si la variable está vacía, lo no reintentable simplemente se loguea y se descarta (`KafkaConsumerConfig.java:55-57`).
- **Type Headers (`__TypeId__`):** **NO SE USAN**. En `EventEnvelopeDeserializer.java:16-17`, el deserializador invoca `super(TypeFactory.defaultInstance().constructParametricType(EventEnvelope.class, JsonNode.class), new ObjectMapper(), false)`. El parámetro booleano `false` desactiva la lectura de type headers del productor. Por lo tanto, ningún emisor necesita enviar headers de tipo Jackson.
- **Estructura del Sobre (`EventEnvelope`):**
  Todos los mensajes en Kafka deben llegar encapsulados en el sobre de 5 campos obligatorios (`src/main/java/com/utn/tpi/roadmap/events/EventEnvelope.java:34-43`):
  1. `eventId` / `event_id` (UUID, no nulo).
  2. `eventType` / `event_type` (String en MAYÚSCULAS_SNAKE_CASE, regex `^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`).
  3. `timestamp` (String ISO-8601 UTC estricto con offset obligatorio `Z` o `±hh:mm`, validado por `StrictTimestampDeserializer.java:46-58`). No se admiten timestamps numéricos (epoch ms).
  4. `producer` (String, no nulo; identifica al micro emisor).
  5. `payload` (Objeto JSON específico del evento).

---

### 1.2 Listener 1: Eventos de Cierre de Desafíos v3 (Vigente)

- **Método Listener:** `RoadmapEventListener.onChallengeClosureEvent` (`src/main/java/com/utn/tpi/roadmap/events/RoadmapEventListener.java:164-184`).
- **Tópico Kafka:** `${app.kafka.topics.challenge-events:challenges.events}` (`application.properties:138`).
- **Consumer Group ID:** `roadmap-service`.
- **Filtro Estricto de Productor:** `producer.equals("THEME-02-CHALLENGE-ENGINE")` (`RoadmapEventListener.java:50, 171`). Mensajes con otro productor son ignorados.
- **Eventos Reconocidos:**
  - `CHALLENGE_COMPLETED`
  - `CHALLENGE_ABORTED`
- **Clase DTO:** `com.utn.tpi.roadmap.events.ChallengeClosurePayload` (`src/main/java/com/utn/tpi/roadmap/events/ChallengeClosurePayload.java:42-58`).

#### Campos del Payload `ChallengeClosurePayload`

| Campo JSON | Tipo Java | Obligatorio en Roadmap | Descripción / Restricciones |
|---|---|:---:|---|
| `id_user` | `UUID` | **SÍ** | Identificador del estudiante |
| `id_course` | `UUID` | **SÍ** | Identificador del curso / cohorte |
| `challenge_id` | `UUID` | **SÍ** | Identificador del desafío en el Motor |
| `id_node` | `UUID` | No (opcional) | Identificador del nodo en Roadmap (hint de verificación, `RoadmapEventListener.java:226`) |
| `id_attempt` | `UUID` | No | Identificador del intento cerrado en el Motor |
| `challenge_version` | `Integer` | No | Versión del desafío evaluada |
| `challenge_type` | `ChallengeType` | No | `NORMAL`, `LIVES`, `LLM` (`ChallengeType.java:6-14`) |
| `content_type` | `MotorChallengeType` | No | `THEORETICAL`, `PRACTICAL` (`MotorChallengeType.java:6-14`) |
| `difficulty` | `Difficulty` | No | `EASY`, `MEDIUM`, `HARD` (`Difficulty.java:6-14`) |
| `mandatory` | `Boolean` | No | Flag de obligatoriedad del desafío |
| `performed_by_user_id` | `UUID` | No | Usuario que provocó el cierre (null si expiró por sistema) |
| `performed_by_role` | `PerformedByRole`| No | `STUDENT`, `PROFESSOR`, `ADMIN`, `SYSTEM` (`PerformedByRole.java:6-14`) |
| `resources` | `Record` | **SÍ** | Recursos involucrados en el intento (`ChallengeClosurePayload.java:115-122`) |
| `resources.xp` | `Long` | **SÍ** | Puntos de experiencia otorgados por este intento (delta) |
| `resources.coins` | `Double` | No | Monedas ganadas (dominio de Accounting; Roadmap lo ignora) |
| `resources.add_live` | `Boolean` | No | Incremento de vidas (Accounting; Roadmap lo ignora) |
| `resources.subtract_live` | `Boolean` | No | Descuento de vidas (Accounting; Roadmap lo ignora) |
| `resources.active_item` | `List<String>` | No | IDs de ítems consumidos en el intento |
| `result` | `Record` | **SÍ** | Detalle de la corrección (`ChallengeClosurePayload.java:150-168`) |
| `result.status` | `AttemptStatus` | **SÍ** (en COMPLETED)| `APPROVED` (aprobado) o `DISAPPROVE` (reprobado). Null en ABORTED (`AttemptStatus.java:9-12`) |
| `result.score` | `Integer` | No | Calificación numérica (0 a 100) |
| `result.completed_at` / `completedAt` | `Instant` | No | Timestamp UTC de finalización |
| `result.late` | `Boolean` | No | Si la entrega fue fuera de término |
| `result.attempt_number` | `Integer` | No | Número de intento |
| `result.resolution_time`| `Double` | No | Tiempo de resolución en segundos |
| `result.started_at` / `startedAt` | `Instant` | No | Timestamp UTC de inicio |
| `result.submitted_at` / `submittedAt` | `Instant` | No | Timestamp UTC de entrega |
| `result.approval_threshold` | `Integer` | No | Umbral de aprobación |
| `result.max_attempts` | `Integer` | No | Máximo de intentos permitidos |
| `result.last_attempt` | `Boolean` | No | Flag de último intento disponible |
| `result.closure_reason` | `AbortReason` | En ABORTED | `CANCELLED`, `EXPIRED`, `ABANDONED` (`AbortReason.java:6-14`) |
| `result.closure_detail` | `String` | No | Texto descriptivo de la anulación |

#### Qué hace Roadmap al recibir `CHALLENGE_COMPLETED`:
1. Valida el sobre y que `producer == "THEME-02-CHALLENGE-ENGINE"` (`RoadmapEventListener.java:171`).
2. Determina aprobación: `passed = AttemptStatus.APPROVED.equals(payload.result().status())` (`RoadmapEventListener.java:216`). Si el estado es `DISAPPROVE`, `passed = false`.
3. Invoca `ProgressService.recordResult` dentro de una transacción (`ProgressService.java:138-197`):
   - **Idempotencia:** Verifica si `eventId` ya existe en la tabla `xp_movement` (`ProgressService.java:140`). Si existe, descarta silenciosamente.
   - **Bloqueo pesimista:** Adquiere lock pesimista sobre la matrícula del alumno en la tabla `student_course` (`ProgressService.java:144-145`). Si el alumno no está matriculado, lanza `NonRetryableEventException("student.not-enrolled")`.
   - **Localización del nodo:** Busca en el roadmap de la cohorte el nodo cuyo `challengeId` coincida (`ProgressService.java:155-165`). Si no existe lanza `node.not-found`; si hay más de uno lanza `node.challenge-ambiguous`. Si viene `id_node` y no coincide con el nodo resuelto, emite una advertencia de mismatch (`line 167`).
   - **Control de aprobación previa:** Si el alumno ya tenía el nodo en `completed_node`, lanza `NonRetryableEventException("node.already-passed")` (`line 170-173`).
   - **Ledger transaccional de XP:** Inserta un registro append-only en la tabla `xp_movement` con `(eventId, courseCohortId, studentId, challengeId, sectionId, xp)` protegido por constraint único `uq_xp_movement_event_id` (`line 175, 208-222`).
   - **Actualización de XP acumulado:** Incrementa `student_course.total_xp` sumando el `xp` del intento (`line 180-181`). *Nota:* Las vidas en `student_course` no se tocan (son dominio de Accounting).
   - **Si el desafío fue aprobado (`passed == true`):**
     1. Guarda la tupla `(studentId, nodeId)` en la tabla `completed_node` (`line 184-187`).
     2. Encola en la tabla `outbox_event` un evento `NODE_COMPLETED` (`line 188-191`).
     3. Evalúa desbloqueos mediante `PrerequisiteService.recordUnlocksAfter`: busca todos los nodos que tengan a `nodeId` como prerrequisito, verifica si sus reglas (AND / OR) están ahora completamente satisfechas, y para cada nuevo nodo habilitado inserta en `node_unlock` con causal `origin = PROGRESS`, `causeNodeId = nodeId`, `causeEventId = eventId` (`PrerequisiteService.java:84-98`).
     4. Encola en `outbox_event` un evento `NODE_UNLOCKED` por cada nodo recién desbloqueado (`ProgressService.java:192-195`).
   - **Si el desafío fue reprobado (`passed == false`):**
     - Registra el movimiento de XP en el ledger (típicamente 0 XP).
     - No guarda en `completed_node`.
     - No desbloquea nodos ni emite eventos outbox.

#### Qué hace Roadmap al recibir `CHALLENGE_ABORTED`:
- Registra en logs informativos el aborto con su motivo (`closureReason`), sin modificar el ledger de XP ni el estado de los nodos (`RoadmapEventListener.java:240`).

#### Ejemplo JSON Válido — `CHALLENGE_COMPLETED` (Aprobado con XP)

```json
{
  "eventId": "a1111111-2222-3333-4444-555555555555",
  "eventType": "CHALLENGE_COMPLETED",
  "timestamp": "2026-10-03T15:30:00Z",
  "producer": "THEME-02-CHALLENGE-ENGINE",
  "payload": {
    "id_user": "30000000-0000-4000-8000-000000000001",
    "id_course": "10000000-0000-4000-8000-000000000001",
    "challenge_id": "40000000-0000-4000-8000-000000000001",
    "id_node": "50000000-0000-4000-8000-000000000001",
    "id_attempt": "60000000-0000-4000-8000-000000000001",
    "challenge_version": 1,
    "challenge_type": "NORMAL",
    "content_type": "THEORETICAL",
    "difficulty": "EASY",
    "mandatory": true,
    "performed_by_user_id": "30000000-0000-4000-8000-000000000001",
    "performed_by_role": "STUDENT",
    "resources": {
      "coins": 10.0,
      "xp": 100,
      "add_live": false,
      "subtract_live": false,
      "active_item": []
    },
    "result": {
      "status": "APPROVED",
      "score": 100,
      "completed_at": "2026-10-03T15:29:55Z",
      "late": false,
      "attempt_number": 1,
      "resolution_time": 45.2,
      "started_at": "2026-10-03T15:25:00Z",
      "submitted_at": "2026-10-03T15:29:50Z",
      "approval_threshold": 70,
      "max_attempts": 3,
      "last_attempt": false
    }
  }
}
```

#### Ejemplo JSON Válido — `CHALLENGE_COMPLETED` (Reprobado)

```json
{
  "eventId": "a1111111-2222-3333-4444-555555555556",
  "eventType": "CHALLENGE_COMPLETED",
  "timestamp": "2026-10-03T15:35:00Z",
  "producer": "THEME-02-CHALLENGE-ENGINE",
  "payload": {
    "id_user": "30000000-0000-4000-8000-000000000001",
    "id_course": "10000000-0000-4000-8000-000000000001",
    "challenge_id": "40000000-0000-4000-8000-000000000002",
    "id_node": "50000000-0000-4000-8000-000000000002",
    "id_attempt": "60000000-0000-4000-8000-000000000002",
    "challenge_version": 1,
    "challenge_type": "NORMAL",
    "content_type": "PRACTICAL",
    "difficulty": "MEDIUM",
    "mandatory": true,
    "performed_by_user_id": "30000000-0000-4000-8000-000000000001",
    "performed_by_role": "STUDENT",
    "resources": {
      "coins": 0.0,
      "xp": 0,
      "add_live": false,
      "subtract_live": true,
      "active_item": []
    },
    "result": {
      "status": "DISAPPROVE",
      "score": 40,
      "completed_at": "2026-10-03T15:34:55Z",
      "late": false,
      "attempt_number": 1,
      "resolution_time": 120.0,
      "started_at": "2026-10-03T15:30:00Z",
      "submitted_at": "2026-10-03T15:34:50Z",
      "approval_threshold": 70,
      "max_attempts": 3,
      "last_attempt": false
    }
  }
}
```

---

### 1.3 Listener 2: Resultados de Desafíos (Versión Legada de Transición)

- **Método Listener:** `RoadmapEventListener.onMessage` (`src/main/java/com/utn/tpi/roadmap/events/RoadmapEventListener.java:135-155`).
- **Tópico Kafka:** `${app.kafka.topics.challenge-result:challenges.results}` (`application.properties:135`).
- **Consumer Group ID:** `roadmap-service`.
- **Eventos Reconocidos:**
  1. `CHALLENGE_COMPLETED`: DTO `ChallengeCompletedPayload` (`ChallengeCompletedPayload.java:39-57`).
     - Campos obligatorios: `attemptId` (UUID), `studentId` (UUID), `courseId` (UUID), `challengeId` (UUID), `difficulty` (`EASY`, `MEDIUM`, `HARD`), `score` (Double), `verdict` (`PASSED`, `FAILED`).
     - Resolución de XP: Si `xp` viene en el payload se usa ese valor; si es null y `verdict == PASSED`, Roadmap recurre al catálogo de parámetros Backoffice PAR-01 (`easy: 100`, `medium: 250`, `hard: 500`) (`RoadmapEventListener.java:262-269, 364-387`). Si falló, `xp = 0`.
  2. `CHALLENGE_ABORTED`: DTO `ChallengeAbortedPayload` (`ChallengeAbortedPayload.java:29-38`). Solo se registra en log.
  3. `ATTEMPT_CORRECTED`: DTO `AttemptCorrectedPayload` (`AttemptCorrectedPayload.java:34-45`).
     - Campos obligatorios: `id_user` (UUID), `id_course` (UUID), `challenge_id` (UUID), `resources.xp` (Long), `resources.substract_live` (Boolean), `result.status` (`APPROVED`, `DISAPPROVE`).
  4. `ATTEMPT_CANCELED`: DTO `AttemptCanceledPayload` (`AttemptCanceledPayload.java:35-46`). Solo valida schema y loguea.

#### Ejemplo JSON Válido — `challenges.results` (`CHALLENGE_COMPLETED`)

```json
{
  "eventId": "b1111111-2222-3333-4444-555555555555",
  "eventType": "CHALLENGE_COMPLETED",
  "timestamp": "2026-10-03T15:40:00Z",
  "producer": "challenges-service",
  "payload": {
    "attemptId": "61111111-2222-3333-4444-555555555555",
    "openingAuthorizationId": "71111111-2222-3333-4444-555555555555",
    "studentId": "30000000-0000-4000-8000-000000000001",
    "courseId": "10000000-0000-4000-8000-000000000001",
    "challengeId": "40000000-0000-4000-8000-000000000001",
    "version": 1,
    "type": "THEORETICAL",
    "difficulty": "EASY",
    "mandatory": true,
    "score": 100.0,
    "verdict": "PASSED",
    "xp": 100,
    "resolutionTimeSeconds": 45,
    "attemptNumber": 1,
    "lastAttempt": false,
    "occurredAt": "2026-10-03T15:39:50Z"
  }
}
```

---

### 1.4 Listener 3: Ciclo de Vida de Cohortes y Matrícula (Courses)

- **Método Listener:** `CoursesLifecycleEventListener.onMessage` (`src/main/java/com/utn/tpi/roadmap/events/CoursesLifecycleEventListener.java:89-104`).
- **Tópico Kafka:** `${app.kafka.topics.courses-lifecycle:courses.events}` (`application.properties:141`).
- **Consumer Group ID:** `roadmap-service`.
- **Eventos Reconocidos:**
  1. `STUDENT_ENROLLED` (`CoursesLifecycleEventListener.java:34, 106-115`).
  2. `STUDENT_UNENROLLED` (`CoursesLifecycleEventListener.java:37, 117-126`).
  3. `COURSE_COHORT_ARCHIVED` (`CoursesLifecycleEventListener.java:40, 128-137`).

#### Detalle de Eventos y Payloads de Courses

##### A. `STUDENT_ENROLLED`
- **DTO:** `com.utn.tpi.roadmap.events.StudentEnrolledPayload` (`StudentEnrolledPayload.java:19-23`).
- **Campos obligatorios:**
  - `courseCohortId` (`UUID`): Identificador de la cohorte.
  - `studentId` (`UUID`): Identificador del estudiante admitido.
  - Otros campos (matrícula, fecha, etc.) se toleran vía `@JsonAnySetter`.
- **Qué hace Roadmap:** Invoca `CourseCohortSyncService.enrollStudent(courseCohortId, studentId)` (`CourseCohortSyncService.java:38-52`). Realiza un upsert idempotente en `student_course`: si el registro no existía, lo crea con `active = true`, `total_xp = 0L`, `lives = 3`, `lost_lives = 0`. Si ya existía, establece `active = true`.

```json
{
  "eventId": "c1111111-2222-3333-4444-555555555555",
  "eventType": "STUDENT_ENROLLED",
  "timestamp": "2026-10-03T10:00:00Z",
  "producer": "course-service",
  "payload": {
    "courseCohortId": "10000000-0000-4000-8000-000000000001",
    "studentId": "30000000-0000-4000-8000-000000000001"
  }
}
```

##### B. `STUDENT_UNENROLLED`
- **DTO:** `com.utn.tpi.roadmap.events.StudentUnenrolledPayload` (`StudentUnenrolledPayload.java:19-23`).
- **Campos obligatorios:** `courseCohortId` (`UUID`), `studentId` (`UUID`).
- **Qué hace Roadmap:** Invoca `CourseCohortSyncService.unenrollStudent` (`CourseCohortSyncService.java:60-67`), estableciendo `active = false` en `student_course`. Si no existía, no hace nada.

```json
{
  "eventId": "c2222222-3333-4444-5555-666666666666",
  "eventType": "STUDENT_UNENROLLED",
  "timestamp": "2026-10-03T11:00:00Z",
  "producer": "course-service",
  "payload": {
    "courseCohortId": "10000000-0000-4000-8000-000000000001",
    "studentId": "30000000-0000-4000-8000-000000000001"
  }
}
```

##### C. `COURSE_COHORT_ARCHIVED`
- **DTO:** `com.utn.tpi.roadmap.events.CourseCohortArchivedPayload` (`CourseCohortArchivedPayload.java:18-22`).
- **Campos obligatorios:** `courseCohortId` (`UUID`).
- **Qué hace Roadmap:** Invoca `CourseCohortSyncService.archiveCohort` (`CourseCohortSyncService.java:74-81`), estableciendo `archived = true` en `roadmap`. Si la cohorte aún no tiene roadmap, no hace nada.

```json
{
  "eventId": "c3333333-4444-5555-6666-777777777777",
  "eventType": "COURSE_COHORT_ARCHIVED",
  "timestamp": "2026-10-03T12:00:00Z",
  "producer": "course-service",
  "payload": {
    "courseCohortId": "10000000-0000-4000-8000-000000000001"
  }
}
```

---

### 1.5 Listener 4: Parámetros Globales (Backoffice)

- **Método Listener:** `ParRefreshListener.onMessage` (`src/main/java/com/utn/tpi/roadmap/events/ParRefreshListener.java:51-62`).
- **Tópico Kafka:** `${app.kafka.topics.backoffice:administration.events}` (`application.properties:139`).
- **Consumer Group ID:** `roadmap-service`.
- **Eventos Reconocidos:** `GLOBAL_CONFIGURATION_CHANGED` (`ParRefreshListener.java:27`).
- **Qué hace Roadmap:** Lee `paramKey` del payload e invalida la entrada correspondiente en la caché Caffeine de `ParCatalogClient` (`ParRefreshListener.java:68-78`), obligando a que la siguiente consulta de negocio (`PAR-01`, `PAR-09`, `PAR-12`) la solicite nuevamente vía HTTP a Backoffice.

```json
{
  "eventId": "d1111111-2222-3333-4444-555555555555",
  "eventType": "GLOBAL_CONFIGURATION_CHANGED",
  "timestamp": "2026-10-03T14:00:00Z",
  "producer": "backoffice-service",
  "payload": {
    "paramKey": "PAR-01",
    "version": "2"
  }
}
```

---

### 1.6 Síntesis de Eventos Requeridos por el Flujo Mock

| Evento de Negocio | ¿Existe Consumidor Kafka? | Detalle / Cómo lo maneja Roadmap |
|---|:---:|---|
| **Curso creado** | **NO ENCONTRADO** | Roadmap **no escucha** ningún evento `COURSE_CREATED` o `COHORT_CREATED`. El roadmap se inicializa bajo demanda: al crear la primera sección docente (`POST /courses/{id}/sections`), vía simulación MVP (`POST /courses/{id}/init-mvp` o auto-init en `GET`), o vía semilla `demo`. |
| **Alumno inscripto** | **SÍ** | Escucha `STUDENT_ENROLLED` en `courses.events`. Crea/activa la fila en `student_course` con 3 vidas y 0 XP (`CourseCohortSyncService.java:38-52`). |
| **Desafío/Contenido creado** | **NO ENCONTRADO** | Roadmap **no escucha** eventos de creación de contenido/desafíos. La asociación entre contenidos/desafíos y nodos del roadmap la realiza el docente vía API REST (`POST /sections/{id}/nodes`), o el servicio de simulación `RoadmapSimulationService` tomando desafíos del catálogo del Motor. |
| **Desafío completado con XP** | **SÍ** | Escucha `CHALLENGE_COMPLETED` en `challenges.events` (o `challenges.results`). Suma XP a `student_course.total_xp`, inserta en `xp_movement`, guarda en `completed_node`, evalúa y desbloquea nuevos nodos en `node_unlock` y emite eventos outbox. |
| **Desafío fallado con XP** | **SÍ** | Escucha `CHALLENGE_COMPLETED` con `result.status == "DISAPPROVE"` (o `verdict == "FAILED"`). Inserta el intento en `xp_movement` (con el delta de XP indicado, habitualmente 0), pero **no** marca el nodo como completado ni genera desbloqueos. |

---

## 2. Productores Kafka de Roadmap (Transactional Outbox)

Roadmap nunca escribe directamente en Kafka dentro de sus transacciones de negocio. Implementa el patrón **Transactional Outbox** (`src/main/resources/db/migration/V15__outbox_event.sql`, `src/main/java/com/utn/tpi/roadmap/events/outbox/OutboxService.java:21-105`):

1. Dentro de la transacción local de negocio, `OutboxService.enqueue` serializa un sobre `EventEnvelope<Object>` en la tabla `outbox_event` con estado `PENDING`.
2. Un poller programado en segundo plano (`OutboxPoller.java:64-81`) sondea la tabla cada 3.000 ms (`${app.outbox.poll-interval-ms:3000}`) bloqueando lotes de 50 eventos con `FOR UPDATE SKIP LOCKED` (`outboxEventRepository.lockPendingBatch(50)`).
3. Publica cada evento al broker mediante `KafkaTemplate` y lo marca como `PUBLISHED` (`OutboxPoller.java:95-102`).

### 2.1 Configuración del Outbox

- **Tópico Destino:** `${app.kafka.topics.roadmap-events:}` (`src/main/resources/application.properties:148`).  
  > ⚠️ **ATENCIÓN CRÍTICA PARA EL MOCK STACK:** Esta propiedad se encuentra **vacía por defecto** en el código (`KAFKA_TOPIC_ROADMAP=`). Si no se define la variable de entorno `KAFKA_TOPIC_ROADMAP` (por ejemplo `KAFKA_TOPIC_ROADMAP=roadmap.events`), el `OutboxPoller` no publica ningún mensaje y emite un warning: `"Topic de eventos de roadmap no configurado..."` (`OutboxPoller.java:85-88`). **Debe setearse explícitamente en el stack.**
- **Message Key de Kafka:** `studentId.toString()` (`OutboxService.java:95`). Permite particionado consistente por alumno.
- **Producer en el Envelope:** `"roadmap-service"` (`${spring.application.name}`, `OutboxService.java:42, 81`).

---

### 2.2 Evento 1: `NODE_COMPLETED`

Emitido inmediatamente después de que un estudiante aprueba un desafío (`ProgressService.java:188-191`).

- **eventType:** `"NODE_COMPLETED"`
- **Clase Payload:** `com.utn.tpi.roadmap.events.NodeCompletedPayload` (`NodeCompletedPayload.java:17-23`).
- **Campos del Payload:**
  - `courseId` (`UUID`): Identificador del curso / cohorte (`courseCohortId`).
  - `studentId` (`UUID`): Identificador del estudiante.
  - `nodeId` (`UUID`): Identificador del nodo superado en Roadmap.
  - `challengeId` (`UUID`): Identificador del desafío en el Motor.
  - `sectionId` (`UUID`): Identificador de la sección (unidad) que contiene al nodo.

#### Ejemplo JSON Válido Producido — `NODE_COMPLETED`

```json
{
  "eventId": "e1111111-2222-3333-4444-555555555555",
  "eventType": "NODE_COMPLETED",
  "timestamp": "2026-10-03T15:30:01.123456Z",
  "producer": "roadmap-service",
  "payload": {
    "courseId": "10000000-0000-4000-8000-000000000001",
    "studentId": "30000000-0000-4000-8000-000000000001",
    "nodeId": "50000000-0000-4000-8000-000000000001",
    "challengeId": "40000000-0000-4000-8000-000000000001",
    "sectionId": "20000000-0000-4000-8000-000000000001"
  }
}
```

---

### 2.3 Evento 2: `NODE_UNLOCKED`

Emitido por cada nodo que pasa a estado desbloqueado para el alumno como consecuencia directa de haber completado un nodo previo (`ProgressService.java:192-195`).

- **eventType:** `"NODE_UNLOCKED"`
- **Clase Payload:** `com.utn.tpi.roadmap.events.NodeUnlockedPayload` (`NodeUnlockedPayload.java:15-20`).
- **Campos del Payload:**
  - `courseId` (`UUID`): Identificador del curso / cohorte (`courseCohortId`).
  - `studentId` (`UUID`): Identificador del estudiante.
  - `nodeId` (`UUID`): Identificador del nodo que acaba de quedar desbloqueado.

#### Ejemplo JSON Válido Producido — `NODE_UNLOCKED`

```json
{
  "eventId": "e2222222-3333-4444-5555-666666666666",
  "eventType": "NODE_UNLOCKED",
  "timestamp": "2026-10-03T15:30:01.135790Z",
  "producer": "roadmap-service",
  "payload": {
    "courseId": "10000000-0000-4000-8000-000000000001",
    "studentId": "30000000-0000-4000-8000-000000000001",
    "nodeId": "50000000-0000-4000-8000-000000000002"
  }
}
```

---

## 3. Llamadas HTTP Salientes de Roadmap

Todas las llamadas salientes utilizan Spring `RestClient` y se dirigen **exclusivamente al API Gateway** configurado en `GATEWAY_URL` (`http://localhost:8080`), nunca directo a la IP/puerto del microservicio (`application.properties:34-35`).  
*Descubrimiento Eureka:* `eureka.client.fetch-registry=false` (`application.properties:104`); Roadmap no resuelve instancias mediante Eureka para llamadas salientes, confía en el Gateway como reverse proxy unificado.

---

### 3.1 Users / Gateway: Emisión de Token Técnico (Client Credentials)

- **Cliente Java:** `HttpTechnicalTokenProvider.java:93-100`.
- **Método HTTP:** `POST`
- **URL Completa:** `${app.clients.auth.base-url:${GATEWAY_URL:http://localhost:8080}}${app.clients.auth.token-path:/api/users/public/auth/token}`
- **Variables de Entorno:**
  - `GATEWAY_URL` (default: `http://localhost:8080`)
  - `TECHNICAL_TOKEN_PATH` (default: `/api/users/public/auth/token`)
  - `ROADMAP_TECHNICAL_CLIENT_ID`
  - `ROADMAP_TECHNICAL_CLIENT_SECRET`
- **Headers Enviados:**
  - `Content-Type: application/json`
  - `Accept: application/json`
- **Request Body JSON (`TokenRequest`):**
  ```json
  {
    "clientId": "roadmap-service",
    "clientSecret": "roadmap-secret-key",
    "grantType": "client_credentials",
    "scope": "challenges.catalog.read",
    "audience": "engine-challenge-service"
  }
  ```
- **Response Esperada HTTP 200 (`TokenResponse`):**
  ```json
  {
    "accessToken": "eyJhbGciOi...",
    "tokenType": "bearer",
    "expiresIn": 3600
  }
  ```
- **Comportamiento en Roadmap:** Mantiene caché en memoria de tokens vigentes indexada por `(audience, scope)` (`HttpTechnicalTokenProvider.java:39`). Si el token expira o falta configuración, lanza `TechnicalTokenUnavailableException`.

---

### 3.2 Courses: Verificación de Titularidad Docente (`membership`)

- **Cliente Java:** `HttpCohortOwnershipClient.java:79-88`.
- **Método HTTP:** `GET`
- **URL Completa:** `${app.clients.courses.base-url:${GATEWAY_URL:http://localhost:8080}}${app.clients.courses.membership-path:/api/course/course-cohorts/{courseCohortId}/membership}`
- **Headers Enviados:**
  - `X-Principal-Type: user`
  - `X-User-Id: <UUID del profesor emisor>`
  - `X-User-Roles: PROFESSOR`
- **Response Esperada HTTP 200 (`MembershipResponse`):**
  ```json
  {
    "courseCohortId": "10000000-0000-4000-8000-000000000001",
    "role": "PROFESSOR",
    "canRead": true,
    "canWrite": true
  }
  ```
- **Comportamiento en Roadmap:**
  - Si `canWrite == true`: autoriza la edición del grafo.
  - Si responde HTTP 403 o 404: `isOwner` devuelve `false` (resultando en 403 `course.not-owner` para el llamante).
  - Si el usuario tiene rol `ADMIN` en `X-User-Roles`, **Roadmap saltea esta llamada HTTP** (`GraphController.java:322-324`).
  - Caché Caffeine: TTL de 30s (`COURSES_CATALOG_CACHE_TTL:30s`).

---

### 3.3 Courses: Metadatos de Contenidos en Lote (`contents/batch`)

- **Cliente Java:** `HttpCoursesCatalogClient.java:97-102`.
- **Método HTTP:** `POST`
- **URL Completa:** `${app.clients.courses.base-url:${GATEWAY_URL:http://localhost:8080}}${app.clients.courses.batch-path:/api/course/contents/batch}`
- **Variable de modo:** `app.clients.courses.catalog-mode=${COURSES_CATALOG_MODE:stub}` (`application.properties:57`).  
  *Nota:* Actualmente opera en modo `stub` por defecto. En modo `http`, emite la siguiente petición:
- **Request Body JSON (`BatchRequest`):**
  ```json
  {
    "contentIds": [
      "70000000-0000-4000-8000-000000000001",
      "70000000-0000-4000-8000-000000000002"
    ]
  }
  ```
- **Response Esperada HTTP 200 (`BatchResponse`):**
  ```json
  {
    "contents": [
      {
        "contentId": "70000000-0000-4000-8000-000000000001",
        "title": "Introducción a la Sintaxis",
        "type": "DOCUMENT",
        "status": "PUBLISHED"
      }
    ]
  }
  ```

---

### 3.4 Courses: Secciones de la Cohorte (`sections`)

- **Cliente Java:** `HttpCourseSectionsClient.java:60-66`.
- **Uso:** Inicialización del recorrido simulado MVP (`RoadmapSimulationService.java:267`).
- **Método HTTP:** `GET`
- **URL Completa:** `${app.clients.course-sections.base-url:${GATEWAY_URL:http://localhost:8080}}${app.clients.course-sections.path:/api/course/course-cohorts/{courseCohortId}/sections}?page=0&size=50`
- **Headers Enviados:**
  - `Authorization: Bearer <token_tecnico>`
  - `Accept: application/json`
- **Response Esperada HTTP 200 (`PageResponse`):**
  ```json
  {
    "content": [
      {
        "id": "20000000-0000-4000-8000-000000000001",
        "title": "Unidad 1: Programación Básica",
        "orderIndex": 1,
        "isActive": true
      },
      {
        "id": "20000000-0000-4000-8000-000000000002",
        "title": "Unidad 2: Programación Orientada a Objetos",
        "orderIndex": 2,
        "isActive": true
      }
    ]
  }
  ```
- **Fallback si falla:** Si Courses no responde, Roadmap usa sus 2 unidades por defecto (`DEFAULT_UNITS = ["Unidad 1: Fundamentos", "Unidad 2: Programación Estructurada"]`) (`RoadmapSimulationService.java:67, 271`).

---

### 3.5 Motor de Desafíos: Existencia de Desafío (`challenges/{id}`)

- **Cliente Java:** `HttpMotorCatalogClient.java:63-68`.
- **Uso:** Al dar de alta o actualizar un nodo de tipo desafío (`THEORETICAL_CHALLENGE`, `PRACTICAL_CHALLENGE`, `EXAM`) para validar que exista en el catálogo del Motor (`GraphValidator.java:72-92`).
- **Método HTTP:** `GET`
- **URL Completa:** `${app.clients.motor.base-url:${GATEWAY_URL:http://localhost:8080}}${app.clients.motor.exists-path:/api/engine-challenge/challenges/{challengeId}}`
- **Headers Enviados:**
  - `Authorization: Bearer <token_tecnico>` (audience: `engine-challenge-service`, scope: `challenges.catalog.read`)
  - `Accept: application/json`
- **Response Esperada:**
  - HTTP `200 OK` (body no requerido / toBodilessEntity): el desafío existe.
  - HTTP `404 Not Found`: el desafío no existe (rechaza el alta con 404 `node.challenge-unknown`).
  - Error HTTP / Timeout: loguea aviso y procede en modo degradado (`GraphValidator.java:90`).

---

### 3.6 Motor de Desafíos: Pool de Desafíos Publicados (`challenges?status=PUBLISHED`)

- **Cliente Java:** `HttpMotorCatalogClient.java:85-91`.
- **Uso:** Generación automática del recorrido simulado MVP (`RoadmapSimulationService.java:285`).
- **Método HTTP:** `GET`
- **URL Completa:** `${app.clients.motor.base-url:${GATEWAY_URL:http://localhost:8080}}${app.clients.motor.pool-path:/api/engine-challenge/challenges}?status=PUBLISHED&page=0&size=50`
- **Headers Enviados:**
  - `Authorization: Bearer <token_tecnico>`
  - `Accept: application/json`
- **Response Esperada HTTP 200 (`ListResponse`):**
  ```json
  {
    "content": [
      {
        "id": "40000000-0000-4000-8000-000000000001",
        "type": "THEORETICAL",
        "status": "PUBLISHED",
        "title": "Variables y Tipos de Datos"
      },
      {
        "id": "40000000-0000-4000-8000-000000000002",
        "type": "PRACTICAL",
        "status": "PUBLISHED",
        "title": "Estructuras de Control"
      }
    ]
  }
  ```
- **Fallback si falla:** Si el Motor no responde o no devuelve publicados, Roadmap usa un pool determinista en memoria de 4 desafíos (`RoadmapSimulationService.java:293, 300`).

---

### 3.7 Accounting: Disponibilidad de Vidas (`lives-availability`)

- **Cliente Java:** `HttpInventoryClient.java:96-103`.
- **Uso:** Evaluación del Gate de elegibilidad (`GateService.java:92`) y cálculo de progreso general (`NodeProgressService.java:73`).
- **Método HTTP:** `GET`
- **URL Completa:** `${app.clients.inventory.base-url:${GATEWAY_URL:http://localhost:8080}}${app.clients.inventory.lives-availability-path:/api/accounting/courses/{courseId}/accounts/{studentId}/lives-availability}`
- **Headers Enviados:**
  - `Authorization: Bearer <token_tecnico>`
  - `Accept: application/json`
- **Response Esperada HTTP 200 (`LivesAvailabilityResponse`):**
  ```json
  {
    "currentLives": 3,
    "reservedLives": 0
  }
  ```
- **Comportamiento en Roadmap:**
  - Si `currentLives - reservedLives > 0`: `hasLives() == true`.
  - Si Accounting cae y no hay caché: lanza `InventoryUnavailableException`, resultando en HTTP 503 para el Gate.
  - Caché Caffeine: TTL de 30s (`INVENTORY_CACHE_TTL:30s`).
  - Modo por defecto: `INVENTORY_CLIENT_MODE=stub` (`application.properties:75`), donde `InMemoryInventoryClient` provee vidas deterministas (3 vidas por alumno).

---

### 3.8 Accounting: Resumen de Inventario (`equip-summary`)

- **Cliente Java:** `HttpInventoryClient.java:112-121`.
- **Uso:** Endpoint `GET /courses/{courseId}/inventory` (`InventoryController.java:39`).
- **Método HTTP:** `GET`
- **URL Completa:** `${app.clients.inventory.base-url:${GATEWAY_URL:http://localhost:8080}}${app.clients.inventory.equip-summary-path:/api/accounting/courses/{courseId}/accounts/{studentId}/equip-summary}`
- **Headers Enviados:**
  - `Authorization: Bearer <token_tecnico>`
  - `Accept: application/json`
- **Response Esperada HTTP 200 (`EquipSummaryResponse`):**
  ```json
  {
    "currentLives": 3,
    "reservedLives": 0,
    "availableBalance": 250.50,
    "items": [
      {
        "itemInstanceId": "90000000-0000-4000-8000-000000000001",
        "catalogItemId": "item_shield_01",
        "itemName": "Escudo de Vida",
        "itemType": "DEFENSE",
        "itemEffect": "PREVENT_LIFE_LOSS",
        "applicableChallengeScope": "ALL",
        "status": "EQUIPPED",
        "maxCharges": 2,
        "remainingUses": 1
      }
    ]
  }
  ```
- **Degradación:** Si Accounting no responde pero existió una consulta en las últimas 24h (`INVENTORY_LAST_KNOWN_RETENTION:24h`), Roadmap sirve el último dato conocido con flag `stale = true` y aviso descriptivo (`InventoryService.java:38-50`).

---

### 3.9 Backoffice: Parámetros Globales (`parameters`)

- **Cliente Java:** `HttpParCatalogClient.java:187-196`.
- **Uso:** Lectura de parámetros del juego en frío (`PAR-01`, `PAR-09`, `PAR-12`).
- **Método HTTP:** `GET`
- **URL Completa:** `${app.clients.backoffice.base-url:${GATEWAY_URL:http://localhost:8080}}${app.clients.backoffice.parameters-path:/api/backoffice/parameters}`
- **Headers Enviados:**
  - `Authorization: Bearer <token_tecnico>` (audience: `backoffice-service`, scope: `backoffice.parameters.read`)
  - `Accept: application/json`
- **Response Esperada HTTP 200 (Array JSON):**
  ```json
  [
    {
      "key": "PAR-01",
      "value": {
        "easy": 100,
        "medium": 250,
        "hard": 500
      }
    },
    {
      "key": "PAR-09",
      "value": [
        { "level": 1, "xpRequired": 0 },
        { "level": 2, "xpRequired": 250 },
        { "level": 3, "xpRequired": 600 }
      ]
    },
    {
      "key": "PAR-12",
      "value": {
        "initialLives": 3,
        "maxLives": 5
      }
    }
  ]
  ```
- **Caché:** TTL 5 minutos (`BACKOFFICE_PAR_CACHE_TTL:5m`). Se invalida inmediatamente al recibir `GLOBAL_CONFIGURATION_CHANGED` por Kafka.

---

## 4. Seguridad: Headers del API Gateway

Roadmap es un microservicio stateless que no maneja logins, passwords ni tokens JWT de usuario final. Toda la autenticación es delegada al API Gateway, el cual inyecta cabeceras HTTP de identidad técnica verificada (`src/main/java/com/utn/tpi/roadmap/common/security/GatewayHeadersFilter.java:26-99` y `SecurityConfig.java:20-53`).

### 4.1 Headers Leídos e Interpretados

El filtro `GatewayHeadersFilter` se ejecuta una vez por petición (`OncePerRequestFilter`) antes de `AnonymousAuthenticationFilter`:

1. **Cabecera Discriminadora:** `X-Principal-Type`
   - Valor `"user"`: Representa un usuario humano interactuando a través del front/gateway.
   - Valor `"service"`: Representa un llamado interno micro a micro autenticado.

2. **Flujo de Usuario (`X-Principal-Type: user`):**
   - **`X-User-Id` (OBLIGATORIO):** Debe ser un string parseable como `java.util.UUID`.
   - **`X-User-Roles` (OPCIONAL/REQUERIDO POR ENDPOINT):** Lista de roles separada por comas (ej. `STUDENT`, `PROFESSOR`, `ADMIN`).
   - **Reglas de exclusión estricta:** Si la petición contiene simultáneamente `X-Service-Id`, `X-Service-Scopes` o `X-Delegated-User`, el filtro **aborta la autenticación** y deja el contexto anónimo (`GatewayHeadersFilter.java:51-53`).
   - **Construcción en Spring Security:**
     - `Principal`: instancia de `java.util.UUID` (`UUID.fromString(userId)`).
     - `Authorities`: lista de `SimpleGrantedAuthority` con prefijo `ROLE_` (ej. `ROLE_STUDENT`, `ROLE_ADMIN`, `ROLE_PROFESSOR`).

3. **Flujo de Servicio (`X-Principal-Type: service`):**
   - **`X-Service-Id` (OBLIGATORIO):** Identificador del servicio emisor (ej. `engine-challenge-service`).
   - **`X-Service-Scopes` (OBLIGATORIO):** Scopes asignados al servicio (ej. `challenges.catalog.read`).
   - **Reglas de exclusión estricta:** Si contiene `X-User-Id`, `X-User-Roles` o `X-Delegated-User`, la autenticación se invalida (`GatewayHeadersFilter.java:64-67`).
   - **Construcción en Spring Security:**
     - `Principal`: instancia de `com.utn.tpi.roadmap.common.security.ServiceIdentity` (`ServiceIdentity.java:9`).
     - `Authorities`: lista vacía.

---

### 4.2 Autorización y Roles Requeridos por Endpoint

Configurado en `SecurityConfig.java:39-50` y anotaciones `@PreAuthorize`:

| Endpoint | Prefijo Path | Requisito Principal | Roles / Scopes Permitidos | Cita de Código |
|---|---|---|---|---|
| `/actuator/**` | N/A | Público / Red interna | `permitAll()` | `SecurityConfig.java:40` |
| `/v3/api-docs/**`, `/swagger-ui/**` | N/A | Público | `permitAll()` | `SecurityConfig.java:40` |
| `/api/roadmap/public/**` (`/ping`) | Público | Cualquiera | `permitAll()` | `SecurityConfig.java:41` |
| `GET .../nodes/{nodeId}/eligibility` | Privado | **Solo Servicio** (`ServiceIdentity`) | Identidad de servicio válida | `SecurityConfig.java:44-45` |
| Todo `/api/roadmap/**` restante | Privado | **Solo Usuario** (`UUID`) | Requiere `Principal instanceof UUID` | `SecurityConfig.java:47-48` |
| `/courses/{id}/sections` (POST) | Privado | Usuario | `ADMIN` o `PROFESSOR` (titular) | `GraphController.java:117` |
| `/sections/{id}` (PUT, PATCH, DEL) | Privado | Usuario | `ADMIN` o `PROFESSOR` (titular) | `GraphController.java:133` |
| `/sections/{id}/nodes` (POST) | Privado | Usuario | `ADMIN` o `PROFESSOR` (titular) | `GraphController.java:179` |
| `/nodes/{id}` (PUT, PATCH, DEL) | Privado | Usuario | `ADMIN` o `PROFESSOR` (titular) | `GraphController.java:195` |
| `/nodes/{id}/rules` (PATCH) | Privado | Usuario | `ADMIN` o `PROFESSOR` (titular) | `GraphController.java:290` |
| `/courses/{id}/init-mvp` (POST) | Privado | Usuario | `ADMIN` o `PROFESSOR` (titular) | `RoadmapInitController.java:59` |
| `/nodes/{nodeId}/read` (POST) | Privado | Usuario | `STUDENT` o `ADMIN` | `ProgressController.java:66` |
| `/courses/{id}/nodes/{nodeId}` (GET) | Privado | Usuario | `STUDENT` o `ADMIN` | `NodeController.java:39` |
| `/courses/{id}/inventory` (GET) | Privado | Usuario | `STUDENT` | `InventoryController.java:38` |
| `/courses/{id}/nodes/{nodeId}/start` | Privado | Usuario | `STUDENT` | `ProgressController.java:52` |
| `/courses/{id}/students/{id}/progress`| Privado | Usuario | `ADMIN`, `PROFESSOR` o el propio `STUDENT` (`#studentId == principal`) | `ProgressController.java:34, 79` |
| `.../students/{id}/xp-history` (GET) | Privado | Usuario (perfil `dev`/`demo`) | `ADMIN`, `PROFESSOR` o el propio `STUDENT` | `XpHistoryController.java:37, 51` |

---

## 5. Configuración de Ejecución e Infraestructura

### 5.1 Identidad del Servicio y Puertos

- **Nombre en Eureka (`spring.application.name`):** `roadmap-service` (`application.properties:3`).  
  El API Gateway utiliza este nombre para el enrutamiento: cualquier petición que llegue al Gateway con prefijo `/api/roadmap/**` se reenvía a las instancias registradas bajo `roadmap-service`.
- **Puerto de Negocio (`server.port`):** `8010` (`${SERVER_PORT:8010}`, `application.properties:6`).
- **Puerto de Gestión (`management.server.port`):** `8011` (`${MANAGEMENT_PORT:8011}`, `application.properties:113`).
- **Prefijos de API:**
  - `app.api.public-path`: `/api/roadmap/public` (`application.properties:10`).
  - `app.api.private-path`: `/api/roadmap` (`application.properties:11`).

---

### 5.2 Perfiles Spring

1. **`default`:** Configuración base para entornos productivos/staging. Conecta a Postgres y Kafka; clientes HTTP en modo productivo (salvo `inventory` que arranca en `stub`).
2. **`dev`:** Activa el controlador de depuración de historial de XP `XpHistoryController` (`@Profile({"dev", "demo"})`, `XpHistoryController.java:29`).
3. **`demo`:** Activa `XpHistoryController` y dispara el sembrado determinista en base de datos mediante `DemoDataSeeder` (`DemoDataSeeder.java:40`).
4. **`test`:** Perfil para pruebas automáticas (`src/test/resources/application.properties`), deshabilita Kafka (`app.kafka.enabled=false`) y utiliza base H2 en memoria.

---

### 5.3 Variables de Entorno para Levantar con Stack Externo

Para ejecutar Roadmap en un contenedor apuntando a Postgres, Kafka, Eureka y Gateway externos, deben configurarse las siguientes variables:

```env
# Servidor y Perfil
SERVER_PORT=8010
MANAGEMENT_PORT=8011
SPRING_PROFILES_ACTIVE=dev

# Base de Datos PostgreSQL
DB_URL=jdbc:postgresql://postgres:5432/roadmap
DB_USERNAME=roadmap
DB_PASSWORD=roadmap

# Service Discovery (Eureka)
EUREKA_URL=http://eureka:8761/eureka/
EUREKA_PREFER_IP_ADDRESS=true
SPRING_CLOUD_INETUTILS_PREFERRED_NETWORKS=172.,10.,192.168.

# Bus de Eventos Apache Kafka
KAFKA_BOOTSTRAP=kafka:9092
KAFKA_CONCURRENCY=3
KAFKA_ENABLED=true
KAFKA_TOPIC_CHALLENGE_EVENTS=challenges.events
KAFKA_TOPIC_CHALLENGE_RESULT=challenges.results
KAFKA_TOPIC_COURSES_LIFECYCLE=courses.events
KAFKA_TOPIC_BACKOFFICE=administration.events
KAFKA_TOPIC_DLQ=roadmap.dlq

# Outbox Publisher (OBLIGATORIO: sin esto no emite eventos)
KAFKA_TOPIC_ROADMAP=roadmap.events
OUTBOX_POLL_INTERVAL_MS=3000
OUTBOX_BATCH_SIZE=50

# Conectividad Saliente vía API Gateway
GATEWAY_URL=http://api-gateway:8080
TECHNICAL_TOKEN_PATH=/api/users/public/auth/token
ROADMAP_TECHNICAL_CLIENT_ID=roadmap-service
ROADMAP_TECHNICAL_CLIENT_SECRET=roadmap-secret

# Modos de Clientes HTTP (http o stub)
# Para el stack inicial o desacoplado, mantener stubs:
COURSES_CLIENT_MODE=http
COURSES_CATALOG_MODE=stub
COURSES_SECTIONS_CLIENT_MODE=stub
MOTOR_CLIENT_MODE=http
INVENTORY_CLIENT_MODE=stub

# Recorrido Simulado MVP (util para pruebas con front sin armar grafo manual)
SIMULATION_ENABLED=true
SIMULATION_AUTO_INIT_ON_GET=true
```

---

### 5.4 Evaluación del Dockerfile

El archivo `Dockerfile` (`Backend/tpi-roadmap/Dockerfile:1-11`) presenta una compilación multi-etapa:

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
COPY .code_quality .code_quality
COPY src src
RUN mvn -B -DskipTests package

FROM gcr.io/distroless/java21-debian12:nonroot
COPY --from=build /workspace/target/tpi-roadmap-*.jar /app.jar
CMD ["/app.jar"]
```

**Diagnóstico:** **SIRVE TAL CUAL**.
- Utiliza Java 21 oficial (`eclipse-temurin-21`).
- Copia las carpetas de verificación de calidad `.code_quality` requeridas por PMD/Checkstyle en el `pom.xml`.
- Genera el artefacto `target/tpi-roadmap-1.0.0.jar`.
- La etapa final corre sobre imagen reducida distroless (`gcr.io/distroless/java21-debian12:nonroot`) como usuario sin privilegios.
- Distroless ejecuta automáticamente Java cuando el entrypoint es `/app.jar`.
- Todas las configuraciones pueden inyectarse mediante variables de entorno en tiempo de ejecución.

---

## 6. Endpoints REST de Roadmap y su Uso por el Frontend

### 6.1 Matriz Completa de Endpoints de Roadmap

Todos los endpoints exitosos devuelven el sobre de plataforma `ApiEnvelope` (`ApiEnvelope.java:13`):
```json
{
  "data": { ... },
  "message": null,
  "success": true,
  "timestamp": "2026-10-03T15:00:00Z"
}
```

| Método | Ruta Completa en Gateway | Roles Requeridos | ¿Usado por el Frontend? | Método / Archivo en Frontend |
|---|---|---|:---:|---|
| `GET` | `/api/roadmap/public/ping` | Ninguno (público) | No | Health check de infraestructura |
| `GET` | `/api/roadmap/courses/{courseId}` | Autenticado | **SÍ** | `HttpRoadmapAdapter.getRoadmap` (`http-roadmap.adapter.ts:140`) |
| `POST` | `/api/roadmap/courses/{courseId}/sections` | `ADMIN`, `PROFESSOR` | **SÍ** | `HttpRoadmapAdapter.addSection` (`http-roadmap.adapter.ts:151`) |
| `PUT` | `/api/roadmap/sections/{sectionId}` | `ADMIN`, `PROFESSOR` | **SÍ** | `HttpRoadmapAdapter.updateSection` (`line 175`), `moveSection` (`line 216`) |
| `PATCH` | `/api/roadmap/sections/{sectionId}` | `ADMIN`, `PROFESSOR` | No | Front utiliza PUT |
| `DELETE` | `/api/roadmap/sections/{sectionId}` | `ADMIN`, `PROFESSOR` | **SÍ** | `HttpRoadmapAdapter.removeSection` (`http-roadmap.adapter.ts:209`) |
| `POST` | `/api/roadmap/sections/{sectionId}/nodes` | `ADMIN`, `PROFESSOR` | **SÍ** | `HttpRoadmapAdapter.addActivity` (`http-roadmap.adapter.ts:241`) |
| `PUT` | `/api/roadmap/nodes/{nodeId}` | `ADMIN`, `PROFESSOR` | **SÍ** | `HttpRoadmapAdapter.updateActivity` (`line 265`), `moveActivity` (`line 305`) |
| `PATCH` | `/api/roadmap/nodes/{nodeId}` | `ADMIN`, `PROFESSOR` | No | Front utiliza PUT |
| `DELETE` | `/api/roadmap/nodes/{nodeId}` | `ADMIN`, `PROFESSOR` | **SÍ** | `HttpRoadmapAdapter.removeActivity` (`http-roadmap.adapter.ts:293`) |
| `PATCH` | `/api/roadmap/nodes/{nodeId}/availability` | `ADMIN`, `PROFESSOR` | No directo | Conmutación manual docente |
| `PATCH` | `/api/roadmap/nodes/{nodeId}/mandatory` | `ADMIN`, `PROFESSOR` | No directo | Front actualiza vía PUT de actividad |
| `PATCH` | `/api/roadmap/nodes/{nodeId}/prerequisite-mode` | `ADMIN`, `PROFESSOR` | No directo | Front actualiza vía `/rules` |
| `PATCH` | `/api/roadmap/nodes/{nodeId}/rules` | `ADMIN`, `PROFESSOR` | **SÍ** | `HttpRoadmapAdapter.updateRules` (`line 427`), `addConnection`, `removeConnection` |
| `POST` | `/api/roadmap/nodes/{nodeId}/prerequisites` | `ADMIN`, `PROFESSOR` | No | Front usa `rules` en lote |
| `POST` | `/api/roadmap/courses/{courseId}/init-mvp` | `ADMIN`, `PROFESSOR` | No en UI | Endpoint de inicialización rápida / demo |
| `GET` | `/api/roadmap/courses/{courseId}/students/{studentId}/nodes/{nodeId}/eligibility` | **Servicio** | No | **Exclusivo del Motor de Desafíos** |
| `GET` | `/api/roadmap/courses/{courseId}/students/{studentId}/progress` | `ADMIN`, `PROFESSOR`, `STUDENT` | **SÍ** | `HttpRoadmapAdapter.getProgress` (`http-roadmap.adapter.ts:474`) |
| `GET` | `/api/roadmap/courses/{courseId}/nodes/{nodeId}` | `STUDENT`, `ADMIN` | **SÍ** | `HttpRoadmapAdapter.getNodeDetail` (`http-roadmap.adapter.ts:514`) |
| `POST` | `/api/roadmap/nodes/{nodeId}/read` | `STUDENT`, `ADMIN` | **SÍ** | `HttpRoadmapAdapter.markContentRead` (`http-roadmap.adapter.ts:534`) |
| `POST` | `/api/roadmap/courses/{courseId}/nodes/{nodeId}/start` | `STUDENT` | No directo | Contexto para inicio de desafío |
| `GET` | `/api/roadmap/courses/{courseId}/inventory` | `STUDENT` | No conectado | Front usa adapter mock (`InMemoryBankAdapter`) |
| `GET` | `/api/roadmap/courses/{courseId}/students/{studentId}/xp-history` | `ADMIN`, `PROFESSOR`, `STUDENT` | No en UI | Endpoint de depuración (perfil `dev`/`demo`) |

---

### 6.2 Mapeo de Tipos de Nodo: Frontend vs Backend

En `Frontend/.../roadmap-mapper.ts:34-49` existe un adaptador bidireccional entre la nomenclatura visual de Angular y la del backend:

| Tipo en Frontend (`ActivityType`) | Tipo en Backend (`NodeType`) | ¿Requiere `challengeId` en Backend? |
|---|---|:---:|
| `theory` | `CONTENT` | No (debe ser null) |
| `theoretical-challenge` | `THEORETICAL_CHALLENGE` | **SÍ** (UUID obligatorio) |
| `practical-challenge` | `PRACTICAL_CHALLENGE` | **SÍ** (UUID obligatorio) |
| `boss` | `EXAM` | Opcional |
| `milestone` | `UNIT` | No (debe ser null) |

---

### 6.3 Campos Visuales No Persistidos por Roadmap (Deuda Técnica D4 del Front)

El backend mantiene un modelo minimalista. Los siguientes campos que el frontend muestra en el canvas 2D/3D no se persisten en Postgres y se rellenan con defaults en el cliente (`roadmap-mapper.ts:66-91`):
- `positionX`, `positionY`: Llamar a `moveNode` en el adapter del front responde error 501 `node.position-local-only` (`http-roadmap.adapter.ts:346`).
- `description`, `resourceUrl`, `resourceType`: No existen en la tabla `node`.
- `difficulty`, `allowedRetries`: Se delegan al Motor de Desafíos.
- `biome`: Tema visual cosmético exclusivo de Angular.
- `xpThreshold`: Eliminado en la migración `V8__drop_section_xp_threshold.sql`.

---

## 7. Semilla de Demostración (`DemoDataSeeder`)

### 7.1 Cómo Funciona

El componente `DemoDataSeeder` (`src/main/java/com/utn/tpi/roadmap/demo/DemoDataSeeder.java:40`) está anotado con `@Profile("demo")` e implementa `ApplicationRunner`:
- Se ejecuta automáticamente durante el arranque de Spring Boot **únicamente si el perfil `demo` está activo**.
- Es estrictamente idempotente: si la cohorte ya existe en la tabla `roadmap`, no realiza ninguna acción (`DemoDataSeeder.java:83-86`).
- Inicializa los siguientes datos fijos (`DemoData.java:21-80`):
  - **Cohorte:** `10000000-0000-4000-8000-000000000001`
  - **12 Alumnos Matriculados:** `30000000-0000-4000-8000-000000000001` al `...0012`.
  - **3 Secciones y 11 Desafíos:**
    - Sección 1: "Introducción" (Desafíos 1 a 4; el 4 es recuperación de vidas).
    - Sección 2: "Programación orientada a objetos" (Desafíos 5 a 8).
    - Sección 3: "Colecciones y persistencia" (Desafíos 9 a 11).
  - **Reglas de Prerrequisitos:**
    - Desafío 5 exige 1 y 2 (`AND`).
    - Desafío 7 exige 5 y 6 (`AND`).
    - Desafío 9 exige 7 u 8 (`OR`).
  - **Simulación de Intentos:**
    - Ejecuta un guión de intentos para cada alumno con llamadas internas a `ProgressService.recordResult`.
    - Alumno 01: 0 XP (sin intentos).
    - Alumno 02: 3 intentos fallidos en Desafío 2 (queda con 0 vidas).
    - Alumnos 03 al 12: avances progresivos con aprobaciones y fallos para simular diferentes percentiles de XP.

### 7.2 Cómo Desactivar la Semilla

Para desactivar completamente la semilla demo y arrancar con la base de datos limpia:
1. **Omitir el perfil `demo`:** Configurar `SPRING_PROFILES_ACTIVE=dev` o `SPRING_PROFILES_ACTIVE=default`.
2. Al no estar activo el perfil `demo`, la clase `DemoDataSeeder` ni siquiera es instanciada por el contenedor de Spring.
3. *Consecuencia a tener en cuenta en el mock stack:* Sin la semilla demo y sin un evento `STUDENT_ENROLLED` previo, la tabla `student_course` estará vacía y cualquier petición de progreso de un alumno responderá HTTP 403 `student.not-enrolled`. En un entorno limpio sin semilla, el mock stack debe emitir los eventos `STUDENT_ENROLLED` a `courses.events` o usar `POST /api/roadmap/courses/{id}/init-mvp`.
