# Contrato de Servicio: course-service (Tema 02 — Cursos y Matrícula)

> Grupo 10 · Mock Stack `tpi-roadmap-mocks`  
> Documento de fidelidad contractual según regla R2 / R14 de `IMPLEMENTACION.md`.

## 1. Identidad y Metadatos de Infraestructura

- **Nombre en Eureka:** `course-service`
- **Puerto interno:** `8086`
- **Prefijo en API Gateway:** `/api/course/**`
- **Tópico Kafka:** `courses.events`
- **Producer Kafka:** `"tema-02-cursos-matricula"`
- **EventVersion:** `1` (R6)

---

## 2. Fuentes Contractuales Analizadas

1. **Microservicio Real (`_integracion/tpi-course`):**
   - Repositorio: `Backend/_integracion/tpi-course` @ `0448b6ac37b6fb26ef5584ca471ff65d515074b8`
   - `InstitutionsApiController.java:28` (`GET /api/course/institution?name=...`)
   - `CourseBasesApiController.java:35` (`POST /api/course/course-base`), `42` (`GET /api/course/course-base/institution/{id}`)
   - `CourseCohortsApiController.java:103` (`PATCH /api/course/course-cohorts/{id}`), `117` (`activate`), `129` (`create`), `140` (`me`), `203` (`membership`), `217` (`invite professor`), `234` (`list professors`), `250` (`deactivate`)
   - `EnrollmentsApiController.java:59` (`list cohort enrollments`), `78` (`create enrollment`), `94` (`approve exception`), `108` (`reject`), `121` (`me`)
   - `CourseSectionsApiController.java:73` (`create section`), `87` (`get section by id`), `116` (`list cohort sections`), `137` (`update section`), `151` (`delete section`), `164` (`reorder sections`)
   - `EventEnvelope.java:18-25` (Sobre canónico con `eventId`, `eventType`, `eventVersion: 1`, `timestamp`, `producer`, `payload`)

2. **Frontend Angular (`Frontend/2026-PIV-TPI-FE`):**
   - Repositorio: `Frontend/2026-PIV-TPI-FE` @ `origin/develop` (`f70c508f8a7e1758a3b6c2486729a0ba8fd42c71`)
   - `src/app/features/courses/data-access/course-cohort.models.ts:48-95` (`CourseCohortItem`, `MyCohortSummary`, `CourseCohortPageResponse`, `CreateCourseCohortRequest`, `CourseCohortResponse`)
   - `src/app/features/courses/data-access/cohort-detail.models.ts:8-33` (`CourseCohortDetail`, `CohortMembershipResponse`)
   - `src/app/features/courses/data-access/courses.service.ts:46-365` (Llamadas a `/institution`, `/course-base`, `/course-cohorts`, `/me`, `/{id}`, `/membership`, `/professors`, `/enrollments`)
   - `src/app/features/courses/data-access/sections.service.ts:62-162` (Llamadas a `/course-cohorts/{id}/sections`, `/course-sections/{id}`, `/order`)
   - `src/app/features/courses/data-access/section.models.ts:10-54` (`SectionResponse`, `CreateSectionRequest`, `UpdateSectionRequest`, `ReorderSectionsRequest`, `SectionPageResponse`)
   - `src/app/features/courses/data-access/cohort-membership.service.ts:51` (`GET /course/course-cohorts/{id}/membership`)
   - `src/app/features/accounting/data-access/course-http/course-enrollments-api.service.ts:14-43` (`GET /course/enrollments/me` -> `BackendCourseEnrollment[]`)

3. **Consumidor Roadmap (`Backend/tpi-roadmap`):**
   - Repositorio: `Backend/tpi-roadmap` @ `develop` (`02c14b9ba633d3610b9c90d696c84db32253cf80`)
   - `HttpCohortOwnershipClient.java:79-121`: Invocación de `GET /api/course/course-cohorts/{courseCohortId}/membership` con headers `X-Principal-Type: user`, `X-User-Id`, `X-User-Roles: PROFESSOR`. Espera DTO `MembershipResponse(courseCohortId, role, canRead, canWrite)`. 404 si la cohorte no existe.
   - `CoursesLifecycleEventListener.java:92-115`: Consumidor Kafka en `${app.kafka.topics.courses-lifecycle}` (`courses.events`) de `STUDENT_ENROLLED`.
   - `StudentEnrolledPayload.java:19-23`: Payload con `courseCohortId: UUID`, `studentId: UUID` y deserialización flexible (`JsonAnySetter`).

---

## 3. Endpoints Expuestos

| Método | Path | Request Body / Query | Response Body | Status | Rol / Contexto |
|---|---|---|---|---|---|
| `GET` | `/api/course/course-cohorts/me` | Query: `page`, `size`, `status` | `CourseCohortPageResponse` | 200 | Rol-aware: Alumno (sin `professorRole`, `settings`, `invitationCode`), Docente/Gestor (con `professorRole`), Admin (todas). |
| `GET` | `/api/course/course-cohorts/{id}` | — | `CourseCohortDetail` | 200 / 404 | Detalle completo de cohorte. |
| `PATCH` | `/api/course/course-cohorts/{id}` | `UpdateCohortConfigurationRequest` | `CourseCohortDetail` | 200 / 404 | Edición de configuraciones/fechas. |
| `GET` | `/api/course/course-cohorts/{id}/membership` | — | `CohortMembershipResponse` | 200 / 404 | `{ courseCohortId, role, canRead: true, canWrite: rol != 'STUDENT' }`. Usado por front y roadmap. |
| `POST` | `/api/course/course-cohorts` | `CreateCourseCohortRequest` | `CourseCohortResponse` | 201 | Nace `ACTIVE` con `invitationCode`. Publica `COURSE_COHORT_ACTIVATED`. |
| `PATCH` | `/api/course/course-cohorts/{id}/activate` | — | `CourseCohortResponse` | 200 / 404 | Activa cohorte y publica `COURSE_COHORT_ACTIVATED`. |
| `PATCH` | `/api/course/course-cohorts/{id}/deactivate` | — | — | 204 / 404 | Baja lógica (ARCHIVED). |
| `POST` | `/api/course/course-cohorts/{id}/invitation-code` | — | `CourseCohortResponse` | 200 / 404 | Regenera código de invitación. |
| `GET` | `/api/course/institution` | Query: `name` | `InstitutionResponse` | 200 | Datos de la institución UTN. |
| `GET` | `/api/course/course-base/institution/{id}` | — | `CourseBaseResponse[]` | 200 | Materias base asociadas a la institución. |
| `POST` | `/api/course/course-base` | `CreateCourseBaseRequest` | `CourseBaseResponse` | 201 | Alta de curso base. |
| `POST` | `/api/course/enrollments` | `{ invitationCode, studentNumber? }` | `EnrollmentResponse` | 201 / 404 | Auto-inscripción de alumno con código. Pasa a `VALIDATED` y publica `STUDENT_ENROLLED`. |
| `GET` | `/api/course/enrollments/me` | — | `BackendCourseEnrollment[]` | 200 | Cursos activos del alumno autenticado. |
| `GET` | `/api/course/course-cohorts/{id}/enrollments` | Query: `page`, `size`, `status` | `EnrollmentPageResponse` | 200 | Solicitudes y matrículas de la cohorte. |
| `POST` | `/api/course/enrollments/{id}/approve-exception` | `{ reason }` | `EnrollmentResponse` | 200 / 404 | Aprobación por excepción docente. Publica `STUDENT_ENROLLED`. |
| `POST` | `/api/course/enrollments/{id}/reject` | `{ reason }` | `EnrollmentResponse` | 200 / 404 | Rechazo de solicitud. |
| `GET` | `/api/course/course-cohorts/{id}/sections` | Query: `page`, `size` | `SectionPageResponse` | 200 | Secciones activas de la cohorte. |
| `POST` | `/api/course/course-cohorts/{id}/sections` | `CreateSectionRequest` | `SectionResponse` | 201 | Alta de sección. |
| `GET` | `/api/course/course-sections/{id}` | — | `SectionResponse` | 200 / 404 | Detalle de sección. |
| `PUT` | `/api/course/course-sections/{id}` | `UpdateSectionRequest` | `SectionResponse` | 200 / 404 | Modificación de sección. |
| `DELETE` | `/api/course/course-sections/{id}` | — | — | 204 / 404 | Baja lógica de sección. |
| `PUT` | `/api/course/course-cohorts/{id}/sections/order` | `ReorderSectionsRequest` | `SectionPageResponse` | 200 | Reordenamiento estable de secciones. |
| `GET` | `/api/course/course-cohorts/{id}/professors` | Query: `page`, `size` | `CourseCohortProfessorPageResponse` | 200 | Lista de docentes asignados. |
| `POST` | `/api/course/course-cohorts/{id}/professors` | `InviteProfessorRequest` | `CourseCohortProfessorItem` | 201 | Asignación de docente a la comisión. |
| `GET` | `/api/course/course-cohorts/{id}/students` | Query: `page`, `size`, `search` | `CohortRosterPageResponse` | 200 | Padrón de estudiantes. |
| `GET` | `/api/course/course-cohorts/{id}/student-roster` | — | `text/csv` | 200 | Descarga CSV del padrón oficial. |

---

## 4. Endpoints Exclusivos del Mock (R3)

| Método | Path | Request Body | Response Body | Propósito |
|---|---|---|---|---|
| `GET` | `/api/course/mock/ping` | — | `{ service, ok: true }` | Liveness check básico y smoke test. |
| `GET` | `/api/course/mock/echo` | — | Headers recibidos | Diagnóstico de inyección de headers (`X-User-*`). |
| `POST` | `/api/course/mock/course-cohorts/{id}/students` | `{ studentId, studentNumber? }` | `EnrollmentResponse` (201) | Matricula directa de un alumno sin código y emite `STUDENT_ENROLLED`. |
| `GET` | `/api/course/mock/state` | — | `{ cohorts, enrollments, courseBases, ... }` | Volcado integral del estado en memoria para el panel. |
| `POST` | `/api/course/mock/fault` | `{ status, delayMs, pathPrefix, times }` | `{ ok: true, fault }` | Inyección de fallas controladas (503, latencia). |
| `DELETE` | `/api/course/mock/fault` | — | `{ ok: true, cleared: true }` | Limpieza de fallas inyectadas. |

---

## 5. Eventos Kafka Publicados

Tópico: **`courses.events`**  
Producer: **`tema-02-cursos-matricula`**  
EventVersion: **`1`** (entero obligatorio según R6)

### A. `STUDENT_ENROLLED`
- **Key:** `enrollmentId` (string UUID)
- **Payload:**
```json
{
  "enrollmentId": "e0000000-0000-4000-8000-000000000001",
  "courseCohortId": "10000000-0000-4000-8000-000000000001",
  "studentId": "30000000-0000-4000-8000-000000000001",
  "validationType": "ROSTER_MATCH",
  "enrolledAt": "2026-03-01T10:00:00.000Z"
}
```
*Nota: La republicación de las 12 matrículas sembradas al arrancar está condicionada por la variable de entorno `PUBLISH_SEED_ENROLLMENTS` (por defecto `false`). Con el perfil `demo` de Roadmap (default), Roadmap ya siembra internamente los 12 alumnos y la republicación causaría violación de clave única en `student_course`. Solo se habilita en `true` cuando Roadmap corre sin el perfil `demo`.*

### B. `COURSE_COHORT_ACTIVATED`
- **Key:** `courseCohortId` (string UUID)
- **Payload:**
```json
{
  "courseCohortId": "10000000-0000-4000-8000-000000000001",
  "courseBaseId": "20000000-0000-4000-8000-000000000001",
  "institutionId": "11111111-1111-1111-1111-111111111111",
  "startDate": "2026-03-01",
  "endDate": "2026-12-15"
}
```

---

## 6. Organización de Archivos en el Mock (R9)

Para dar estricto cumplimiento a la regla R9 (`< ~350 líneas` por archivo, modularizado por recurso):
- `mocks/services/courses.mjs` (50 líneas): Punto de entrada (`createApp`, registro Eureka, `/mock/ping`, `/mock/echo`, `/mock/state`, arranque y orquestación).
- `mocks/services/courses/store.mjs` (114 líneas): Estado en memoria, semilla §3, helpers Kafka (`publishStudentEnrolled`, `publishCohortActivated`) y paginador.
- `mocks/services/courses/cohorts.mjs` (244 líneas): Rutas de cohortes, instituciones, cursos base, configuración, docentes y padrón.
- `mocks/services/courses/sections.mjs` (63 líneas): Rutas de secciones de cohorte, alta, edición, baja lógica y reordenamiento.
- `mocks/services/courses/enrollments.mjs` (113 líneas): Rutas de matrículas, auto-inscripción por código de invitación, aprobaciones/rechazos y mock directo.

