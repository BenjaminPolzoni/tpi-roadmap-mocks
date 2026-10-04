# tpi-roadmap-mocks — Plan de implementación

> Grupo 10 · 2026-10-03 · **Este documento manda** sobre `PLAN.md` si algo difiere.
> Base analizada: front `2026-P4-FE/2026-PIV-TPI-FE` @ `origin/develop` **6793198** y roadmap `tpi-roadmap` @ `develop` **02c14b9** (con el contrato Kafka v3).
> ⚠️ El clon local del front estaba 192 commits atrás: **antes de probar, `git pull` en el front y en roadmap.**
> ⚠️ Los informes de `docs/investigacion/` son anteriores al contrato Kafka v3 de roadmap. Ahí donde difieran, valen las reglas de este documento (sobre todo `eventVersion`, R6).

---

## 0. Para qué existe (el criterio que decide todo)

**Levantar el front de roadmap con `ng serve` (hot reload) y ver nuestros cambios sin depender de que los otros grupos tengan sus micros encendidos.**

Con un solo `docker compose up` tienen que quedar:

- un gateway con su Eureka;
- **nuestro roadmap real**;
- mocks de users, courses y del motor de desafíos que responden lo que el front y roadmap necesitan.

En segundo lugar, el stack tiene que dejar **interactuar con las respuestas de los otros micros**:

- aprobar o desaprobar un desafío y ver el desbloqueo;
- inscribir alumnos;
- simular que un micro está caído o lento.

Cuando haya que decidir algo, se elige lo que **más rápido deja ver el front de roadmap funcionando**. La fidelidad con los micros reales importa en los contratos que el front y roadmap consumen; el resto no.

---

## 1. Reglas del repo (obligatorias para cualquiera que toque esto, humano o agente)

| # | Regla |
|---|---|
| R1 | **No se modifica ningún otro repo.** Ni `tpi-roadmap` ni el front. El front se usa con `--proxy-config` apuntando a un archivo de **este** repo. **Única excepción:** el perfil `application-mock.properties` en `tpi-roadmap` (§5.11), que entra por PR. |
| R2 | **Fidelidad de contrato:** un endpoint que existe en el micro real copia **método, path, status y shape** (nombres de campo exactos, mismo casing). La fuente se documenta en `docs/contratos/<micro>.md` con `archivo:línea` y `repo@commit`. |
| R3 | **Lo que no existe en el real va bajo `/api/<seg>/mock/**`.** Nunca se inventan rutas fuera de ese prefijo. |
| R4 | **Sin validaciones:** no hay contraseñas, ni firmas, ni chequeos de dueño o de reglas de negocio. Solo se responde 404 si el id no existe y 400 si falta un campo imprescindible para armar la respuesta. |
| R5 | **IDs fijos** (§3): no se cambian nunca. Cada semilla nueva sigue el mismo formato. |
| R6 | **Kafka (contrato v3):** envelope `{eventId, eventType, eventVersion: 1, timestamp, producer, payload}`. **`eventVersion` es obligatorio y tiene que ser el entero `1`**: sin él roadmap descarta el mensaje como no reintentable (`EventParser.java:64`). `timestamp` va en ISO con `Z`. `eventType` va en MAYÚSCULAS_SNAKE. El valor es texto JSON plano, sin type headers. El `producer` y la key se copian exactos del contrato. Los números que roadmap espera enteros (`xp`, `score`) se mandan enteros. |
| R7 | **Stack fijo:** Node 22, ESM (`.mjs`), solo stdlib (`node:http`, `fetch`, `crypto`) más **`kafkajs`**. Sin TypeScript, sin frameworks y sin build. |
| R8 | **Estado en memoria** con una semilla determinista. Reiniciar el contenedor = volver a la semilla. |
| R9 | **Un archivo por micro** en `mocks/services/`. Lo compartido vive en `mocks/lib/`. Si un archivo pasa ~350 líneas, se divide por recurso, nunca con capas genéricas. |
| R10 | **Eureka:** cada mock se registra como `<segmento>-service` (el mismo nombre que el real), con `hostName` = nombre del servicio en el compose. El gateway **no se toca** para sumar un micro. |
| R11 | **Errores en problem+json:** `{type, title, status, detail}`, con los `type` que entiende el `authInterceptor` del front: `not-authenticated`, `session-closed` y `service-unavailable` (04 §2.4). |
| R12 | **Logs:** una línea por request (`[svc] MÉTODO path → status ms`) y una por evento publicado (`[svc] → topic eventType key`). |
| R13 | **Puertos publicados solo en `127.0.0.1`:** gateway `8080`, eureka `8761`, kafka `9094` y postgres `5433`. Nada más se publica. |
| R14 | **Todo cambio deja `scripts/smoke.sh` en verde.** Si se agrega un endpoint, se agrega a `flujos.http`. Si cambia un contrato, se actualiza `docs/contratos/` con el commit nuevo. |

---

## 2. Qué consume el front de roadmap (mapa pantalla → endpoint)

Este mapa es la fuente de verdad del alcance. Se verificó contra el front `origin/develop` 6793198.

| Pantalla / acción (rutas bajo `/roadmap`) | Endpoint | Lo atiende |
|---|---|---|
| Login, 2FA, refresh, logout | `POST /api/users/public/auth/login`, `…/2fa/verify`, `…/refresh`, `POST /api/users/auth/logout` | mock **users** |
| Sesión al cargar / F5 | `GET /api/users/me` | mock **users** |
| `teacher` (inicio docente) | `GET /api/course/course-cohorts/me?page=0&size=…` (`CohortFacade`) | mock **courses** |
| `student` (mis cursos) | `GET /api/course/course-cohorts/me?page=0&size=100&status=ACTIVE` (`MyCohortSummary`, sin `professorRole`) | mock **courses** |
| `teacher/build/:id`, `teacher/map/:id`, `teacher/section/:id` | `GET /api/roadmap/courses/{id}`, `POST …/courses/{id}/sections`, `PUT/DELETE …/sections/{id}`, `POST …/sections/{id}/nodes`, `PUT/DELETE …/nodes/{id}`, `PATCH …/nodes/{id}/rules`, `POST …/courses/{id}/init-mvp` | **roadmap real** |
| ↳ lo que roadmap llama por detrás | `POST /api/users/public/auth/token`, `GET /api/course/course-cohorts/{id}/membership`, `GET /api/engine-challenge/challenges/{id}`, `GET /api/engine-challenge/challenges?status=PUBLISHED…` | mocks **users**, **courses** y **challenges** |
| `student/course/:id`, `student/section/:id`, `play/…` | `GET /api/roadmap/courses/{id}`, `GET …/students/{sid}/progress`, `GET …/courses/{id}/nodes/{nid}`, `POST …/nodes/{nid}/read` | **roadmap real** |
| Botón de iniciar desafío (`section-map`, `hex-world`, `world-3d`) | `POST /api/engine-challenge/challenges/{id}/intentos` `{courseId, nodeId, attemptType}` → `{attemptId, challengeId, status}` | mock **challenges** |
| ↳ después navega a `/challenges/theoretical/attempts/:id` o `/practical/…` | endpoints de teórico/práctico | **fuera de alcance**: la pantalla puede fallar, y el cierre se hace desde el panel (§5.6) |
| Alta de nodo (wizard): el `challengeId` se pega a mano | — (roadmap lo valida contra el motor) | el id se copia del panel o de la pantalla de desafíos |
| Pantallas de desafíos del docente (feature `challenges`) | `GET/POST /api/engine-challenge/challenges`, `GET/PUT/DELETE …/{id}`, `PATCH …/{id}/status` | mock **challenges** (sirve para crear desafíos desde la UI) |
| Ranking, insignias, banco (vidas y monedas) | — | **in-memory en el front** (`RANKING_PROVIDERS`, `InMemoryBadgesAdapter`, `InMemoryBankAdapter`): hoy no hay nada que mockear |
| Nivel e insignias del alumno en roadmap (el front todavía no los llama, pero son nuestros) | `GET /api/roadmap/courses/{id}/students/{sid}/level`, `…/students/me/level`, `…/students/{sid}/badges` → roadmap pide **PAR-09** a `GET /api/backoffice/parameters` | **roadmap real** + mock **backoffice** (§5.6b) |
| Listado de cursos dentro de roadmap | — | `HttpRoadmapAdapter.listCourses()` devuelve 501 local a propósito; no hay HTTP |
| Dashboard y otras features después del login | depende de cada una | cualquier micro sin mock responde **503 problem+json** desde el gateway; si alguna bloquea la navegación se agrega un stub (§7, tarea T3.5) |

---

## 3. Datos sembrados (IDs fijos)

Los IDs coinciden con la semilla `demo` de roadmap (`DemoData.java`) y con el `proxy.conf.json` del front.

| Qué | ID | Detalle |
|---|---|---|
| Cohorte demo | `10000000-0000-4000-8000-000000000001` | "Programación I — Mock", `ACTIVE`, invitationCode `PROG1-MOCK` |
| Alumnos 1..12 | `30000000-0000-4000-8000-0000000000NN` | `alumnoNN@frc.utn.edu.ar`. El 01 también responde como `alumno@frc.utn.edu.ar`. Los 12 están matriculados en la cohorte demo. |
| Profesor | `2db91e4f-a408-4b4f-85ec-a68804984cad` | `profesor@utn.edu.ar`. Es `PROFESSOR` de la cohorte demo. |
| Gestor | `c0ffee00-aaaa-4bbb-8ccc-ddddeeeeffff` | `gestor@utn.edu.ar`. Es `GESTOR` de la cohorte demo. |
| Admin | `00000000-0000-0000-0000-000000000001` | `admin@utn.edu.ar` |
| Desafíos demo 1..11 | `40000000-0000-4000-8000-0000000000NN` | Título, tipo y dificultad copiados de `DemoData.java` (roadmap). Todos `PUBLISHED`. |

Con el perfil `demo`, roadmap ya trae el grafo de esa cohorte, con los 12 alumnos y progreso variado. El alumno 01 está limpio (0 XP) y es el ideal para probar desbloqueos. El alumno 02 tiene 0 vidas.

---

## 4. Arquitectura y archivos

```
tpi-roadmap-mocks/
├── docker-compose.yml          eureka · event-bus · kafka-init · postgres · gateway · users · courses · challenges · backoffice · roadmap
├── .env.example                ROADMAP_PATH, ROADMAP_PROFILES, SIMULATION_ENABLED
├── mocks/
│   ├── Dockerfile              node:22-alpine, npm ci --omit=dev, CMD lo define el compose
│   ├── package.json            { "type": "module", "dependencies": { "kafkajs": "^2" } }
│   ├── lib/
│   │   ├── http.mjs            router, json/problem, body y cookies, identidad (X-User-*), fallas inyectables
│   │   ├── eureka.mjs          register / heartbeat / deregister
│   │   └── kafka.mjs           publish(topic, key, envelope) con reintento hasta que el broker esté
│   ├── services/
│   │   ├── gateway.mjs
│   │   ├── users.mjs
│   │   ├── courses.mjs
│   │   ├── challenges.mjs
│   │   └── backoffice.mjs
│   └── panel/index.html        panel de control (HTML + JS vanilla, lo sirve el gateway en /_mock/)
├── front/proxy.mock.conf.json
├── flujos.http
├── scripts/smoke.sh
├── docs/contratos/{users,courses,engine-challenge,backoffice}.md
└── README.md
```

---

## 5. Especificación por componente

### 5.1 `lib/http.mjs` (compartido)
- `createApp(name)` registra las rutas con `app.get('/api/x/:id', handler)` (lo mismo para post, put, patch y delete), y `app.listen(port)`.
- Helpers: `json(res, status, body)`, `problem(res, status, type, detail)`, `noContent(res)`, `await readJson(req)` y `cookies(req)`.
- `identity(req)` → `{ userId, roles[] }` a partir de `X-User-Id` y `X-User-Roles`, o `null`.
- **Fallas inyectables (comunes a todos los mocks):**
  - `POST /api/<seg>/mock/fault {status, delayMs, pathPrefix?, times?}` aplica la falla a los requests siguientes que matcheen.
  - `DELETE /api/<seg>/mock/fault` la limpia.
  - Esto sirve para probar cómo degrada el front (por ejemplo, courses con 503 o 3 s de latencia).
- Una línea de log por request (R12).

### 5.2 `lib/eureka.mjs`
- Registro con `POST {EUREKA_URL}/apps/{APP}` y `Content-Type: application/json`. El body es `{instance:{instanceId, hostName, app, ipAddr, vipAddress, secureVipAddress, status:"UP", port:{"$":PORT,"@enabled":"true"}, securePort:{"$":443,"@enabled":"false"}, healthCheckUrl, statusPageUrl, homePageUrl, dataCenterInfo:{"@class":"com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo", name:"MyOwn"}}}`.
- Si Eureka no está listo, reintenta cada 5 s.
- Heartbeat con `PUT …/apps/{APP}/{instanceId}` cada 30 s. Si recibe 404, se vuelve a registrar.
- Con `SIGTERM` hace `DELETE` y sale.

### 5.3 `services/gateway.mjs` (puerto 8080)
- **Ruteo:** `/api/{seg}/…` → app de Eureka `{SEG}-SERVICE`.
  - La consulta es `GET {EUREKA}/apps/{APP}` con `Accept: application/json`; se toma la primera instancia `UP` (`hostName`, `port.$`) y se cachea 5 s.
  - Hace proxy en streaming de método, query, headers y body. **El path no se reescribe.**
  - Si no hay instancia, responde `503` con problem `service-unavailable` y detalle `"<seg>-service no está registrado"`.
- **Identidad:**
  - Token = cookie `fu_at`, o si no hay, `Authorization: Bearer`.
  - Formato del token mock: `mock.<base64url(JSON)>`, con `{type:"user", sub, roles[]}` o `{type:"service", sub, scopes[]}`.
  - **Con token:** se borran `X-Principal-Type`, `X-User-Id`, `X-User-Roles`, `X-Service-Id` y `X-Service-Scopes`, y se inyectan desde el token. Los roles van separados por coma, sin espacios. Los scopes son `MS,<scopes>`.
  - **Sin token:** los `X-*` que vengan **pasan tal cual**. Lo necesita roadmap para `membership`, que manda `X-User-*` a mano, y es cómodo para curl.
  - Siempre agrega `X-Request-Id`.
- **Extras propios:**
  - `GET /_mock/` sirve `panel/index.html`.
  - `GET /_mock/registry` devuelve un JSON con las apps de Eureka y su estado (lo usa el panel).

### 5.4 `services/users.mjs` → `users-service` (8082)

| Método y path | Respuesta |
|---|---|
| `POST /api/users/public/auth/login` `{email,password}` | 200 `{challengeId, message}`. Si el email no existe, 401 `not-authenticated`. |
| `POST /api/users/public/auth/2fa/verify` `{challengeId,code}` | 200 `{expiresIn:3600}` más `Set-Cookie: fu_at=mock.…; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600` y `fu_rt` (`Path=/api/users/public/auth`). Con cualquier código. |
| `POST /api/users/public/auth/refresh` | Con `fu_rt` o `fu_at`: 200 con las cookies renovadas. Si no, 401 `session-closed`. |
| `POST /api/users/auth/logout` | 204 y limpia las cookies (`Max-Age=0`). |
| `GET /api/users/me` | `MeResponse` (02 §1.2) del `X-User-Id`, con `accountStatus:"ACTIVE"`, `mustChangePassword:false`, `firstLogin:false` y `guidedTourCompleted:true`. Sin identidad: 401 `not-authenticated`. |
| `PATCH /api/users/me/onboarding` | 204 |
| `GET /api/users` · `GET /api/users/profile/{id}` | Directorio y perfil público (02 §1.2). |
| `GET /api/users/public/legal/terms` | `{version:"v1", texto:"Términos mock"}` |
| `POST /api/users/public/auth/token` | `{accessToken:"mock.<service>", tokenType:"bearer", expiresIn:3600}`. El `sub` es `clientId` y los `scopes` vienen del body. |
| **mock** `GET /api/users/mock/users` | Lista con email, rol e id (para el panel). |
| **mock** `POST /api/users/mock/users` `{firstNames,lastNames,email,role}` | Crea un usuario y devuelve su id. |
| **mock** `POST /api/users/mock/login-as/{id}` | Setea las cookies de ese usuario sin pasar por el login (los botones del panel). |

> Las cookies no se separan por puerto: la cookie que pone `localhost:8080` (el panel) también la recibe `localhost:4200` (el front). Así, "entrar como" desde el panel y después recargar el front funciona.

### 5.5 `services/courses.mjs` → `course-service` (8086)

| Método y path | Respuesta |
|---|---|
| `GET /api/course/course-cohorts/me?page&size&status` | `CourseCohortPageResponse`. Si es **STUDENT**, devuelve sus cohortes matriculadas **sin** `professorRole`, `settings` ni `invitationCode`. Si es PROFESSOR o GESTOR, las cohortes donde está asignado (con `professorRole`). ADMIN ve todas. |
| `GET /api/course/course-cohorts/{id}` | El detalle (`CourseCohortDetail`, 04 §3.2). |
| `GET /api/course/course-cohorts/{id}/membership` | `{courseCohortId, role, canRead:true, canWrite: rol≠STUDENT}`. Si la cohorte no existe, 404. |
| `GET /api/course/institution` · `GET /api/course/course-base/institution/{id}` · `POST /api/course/course-base` | Una institución fija (UTN) y los cursos base. |
| `POST /api/course/course-cohorts` | La cohorte nace **`ACTIVE`** con su `invitationCode`, y el creador queda como `PROFESSOR` (o `GESTOR` si ese es su rol). Publica `COURSE_COHORT_ACTIVATED`. |
| `PATCH /api/course/course-cohorts/{id}/activate` | Pasa a `ACTIVE` y publica `COURSE_COHORT_ACTIVATED`. |
| `GET/POST /api/course/course-cohorts/{id}/sections` | Paginado / alta (04 §3.2). |
| `POST /api/course/enrollments` `{invitationCode}` | `VALIDATED` y publica `STUDENT_ENROLLED`. |
| `GET /api/course/enrollments/me` | Lo que necesitan las versiones viejas del front. |
| **mock** `POST /api/course/mock/course-cohorts/{id}/students` `{studentId}` | Matricula directo y publica `STUDENT_ENROLLED`. |
| **mock** `GET /api/course/mock/state` | Volcado del estado (para el panel). |

- `STUDENT_ENROLLED` va al topic `courses.events`, con key `enrollmentId`, producer `tema-02-cursos-matricula` y `eventVersion: 1`. El payload es `{enrollmentId, courseCohortId, studentId, validationType, enrolledAt}` (03 §2.4).
- **Al arrancar**, se republica `STUDENT_ENROLLED` de todas las matrículas sembradas. Roadmap hace upsert, así que es idempotente, y aunque se haya borrado su base los alumnos quedan matriculados.

### 5.6 `services/challenges.mjs` → `engine-challenge-service` (8096): catálogo + simulador

| Método y path | Respuesta |
|---|---|
| `GET /api/engine-challenge/challenges?page&size&status&type&difficulty` | `ChallengeResponse` paginado con el shape `Challenge` del front (`id, authorId, type, status, incomplete:false, currentVersion:1, title, description, difficulty, mandatory, retries, approvalThreshold, createdAt`). También sirve para el pool de roadmap (`content[].id/type/status/title`). |
| `GET /api/engine-challenge/challenges/{id}` | `Challenge`, o 404 (roadmap lo usa para validar el alta del nodo). |
| `POST /api/engine-challenge/challenges` | Crea el desafío. Queda **`PUBLISHED`** directamente, para que sirva enseguida en roadmap. |
| `PUT /…/{id}` · `DELETE /…/{id}` · `PATCH /…/{id}/status {status}` · `GET /…/{id}/versiones` | Lo mínimo para las pantallas de desafíos (`versiones` devuelve `[]`). |
| `POST /api/engine-challenge/challenges/{id}/intentos` `{courseId,nodeId,attemptType}` | 201 `{attemptId, challengeId, status:"IN_PROGRESS"}`. Guarda el intento con el `studentId` del `X-User-Id`. |
| **mock** `GET /api/engine-challenge/mock/attempts` | Intentos abiertos y cerrados (para el panel). |
| **mock** `POST /api/engine-challenge/mock/attempts/{attemptId}/close` `{approved, score?, xp?}` | Publica `CHALLENGE_COMPLETED` v3 y devuelve el envelope. |
| **mock** `POST /api/engine-challenge/mock/attempts/{attemptId}/abort` `{reason?}` | Publica `CHALLENGE_ABORTED` (`closure_reason` `CANCELLED` por defecto). |
| **mock** `POST /api/engine-challenge/mock/close` `{studentId, courseId, challengeId, nodeId?, approved, score?, xp?, eventId?}` | Cierre directo sin intento (curl, semilla demo, idempotencia con `eventId` repetido). |

**Evento de cierre** (03 §4.3, 01 §1.2):
- Va al topic `challenges.events`, con key `id_user`, **`producer: "THEME-02-CHALLENGE-ENGINE"`** y **`eventVersion: 1`**. Roadmap filtra por ese producer exacto (`RoadmapEventListener.java:161`).
- El payload completo es: `resources{coins, xp, add_live:false, subtract_live:!approved, active_item:[]}`, `id_user`, `id_course`, `id_node`, `id_attempt`, `challenge_id`, `challenge_version:1`, `challenge_type:"NORMAL"`, `content_type` (THEORETICAL o PRACTICAL), `difficulty`, `mandatory`, `performed_by_user_id`, `performed_by_role:"STUDENT"` y `result{status, score, completedAt, late:false, attempt_number, approval_threshold, max_attempts, last_attempt}`.
- Reglas de los valores:
  - `result.status`: `"APPROVED"` o `"DISAPPROVE"` (**así, sin la D final**).
  - `xp`: si no viene, `BASIC`=100, `MEDIUM`=250 y `ADVANCED`=500 cuando está aprobado, y `0` cuando no. Siempre entero.
  - `difficulty` en el evento: el motor usa BASIC/MEDIUM/ADVANCED, roadmap espera EASY/MEDIUM/HARD. Se mapea `BASIC→EASY` y `ADVANCED→HARD`.
  - `coins`: 100 si está aprobado, 0 si no. Va con decimal.

### 5.6b `services/backoffice.mjs` → `backoffice-service` (8100): parámetros PAR

Roadmap lo necesita para el nivel del alumno (PAR-09) y como fuente de XP base (PAR-01) y vidas (PAR-12). Sin este mock, `…/level` falla con `ParUnavailableException` (`HttpParCatalogClient.java`).

| Método y path | Respuesta |
|---|---|
| `GET /api/backoffice/parameters` | Un array `[{key, value}]`: `PAR-01` = `{easy:100, medium:250, hard:500}`, `PAR-09` = `[{level:1,xpRequired:0},{level:2,xpRequired:250},{level:3,xpRequired:600},{level:4,xpRequired:1000},{level:5,xpRequired:1500}]` y `PAR-12` = `{initialLives:3, maxLives:5}`. Las reglas de validación que aplica roadmap son: PAR-09 arranca en 0, va estrictamente ascendente y los niveles son 1..N consecutivos. |
| **mock** `PUT /api/backoffice/mock/parameters/{key}` `{value}` | Reemplaza el valor y publica `GLOBAL_CONFIGURATION_CHANGED` en `administration.events` (payload `{paramKey, version}`, `eventVersion: 1`). Roadmap invalida su caché (`ParRefreshListener`). Sirve para cambiar la curva de niveles en caliente. |

### 5.7 `panel/index.html` (lo sirve el gateway en `http://localhost:8080/_mock/`)
Es un archivo único, sin build, que solo llama a los endpoints de §5.4 a §5.6. Tiene estas secciones:
1. **Servicios:** el estado de Eureka (`/_mock/registry`) y un botón de falla por servicio (503 / lento / normal).
2. **Sesión:** botones "Entrar como" para profesor, gestor, admin y alumnos 01 a 12. Después se recarga el front.
3. **Cursos:** las cohortes; crear una cohorte; matricular un alumno.
4. **Desafíos:** el catálogo con un botón para copiar el id (para pegarlo en el wizard de nodos); crear un desafío.
5. **Intentos:** lista con los botones **Aprobar**, **Desaprobar** y **Abortar**, y un formulario de cierre directo.

### 5.8 Roadmap real en el compose
- `build: ${ROADMAP_PATH:-../tpi-roadmap}` y `hostname: roadmap`.
- No publica puertos (pasa por el gateway) y no lleva healthcheck, porque la imagen es distroless.
- `depends_on`: postgres (`healthy`), event-bus (`healthy`) y eureka (`healthy`).
- Variables:
```env
SPRING_PROFILES_ACTIVE=${ROADMAP_PROFILES:-dev,demo}
DB_URL=jdbc:postgresql://postgres:5432/roadmap   DB_USERNAME=roadmap   DB_PASSWORD=roadmap
KAFKA_BOOTSTRAP=event-bus:29092
KAFKA_TOPIC_ROADMAP=roadmap.events
EUREKA_URL=http://eureka:8761/eureka/
EUREKA_PREFER_IP_ADDRESS=false
EUREKA_INSTANCE_HOSTNAME=roadmap
GATEWAY_URL=http://gateway:8080
ROADMAP_TECHNICAL_CLIENT_ID=roadmap-service   ROADMAP_TECHNICAL_CLIENT_SECRET=mock
MOTOR_CLIENT_MODE=http   COURSES_CLIENT_MODE=http
COURSES_CATALOG_MODE=stub   COURSES_SECTIONS_CLIENT_MODE=stub   INVENTORY_CLIENT_MODE=stub
SIMULATION_ENABLED=${SIMULATION_ENABLED:-true}
```
- **Modo IDE** (roadmap corriendo en IntelliJ para debuggear): se levanta el stack con `docker compose up -d --scale roadmap=0` y roadmap local con **`SPRING_PROFILES_ACTIVE=dev,mock`**. No hace falta ninguna otra variable.
  - El perfil `mock` es el archivo `tpi-roadmap/src/main/resources/application-mock.properties` (§5.11). Apunta a los puertos **propios** del mock (Postgres `5433`, Kafka `9094`), que nunca coinciden con los de develop. Así la base de develop no se toca por error y los dos entornos pueden convivir.
  - Sin el perfil `mock`, roadmap usa su config de siempre (develop por Tailscale).
  - El gateway lleva `extra_hosts: host.docker.internal:host-gateway`, porque roadmap local se registra en Eureka con hostname `host.docker.internal`.

### 5.11 Perfil `mock` en `tpi-roadmap` (la única excepción a R1)
Es un archivo nuevo, `src/main/resources/application-mock.properties`. No modifica ningún archivo existente y entra por PR desde la rama `feature/perfil-mock` (convención `^(feature|fix)/…` de `branching-name-check.yml`):
```properties
# Perfil "mock": apunta al stack de tpi-roadmap-mocks (ver ese repo). Activar con SPRING_PROFILES_ACTIVE=dev,mock
spring.datasource.url=jdbc:postgresql://localhost:5433/roadmap
spring.datasource.username=roadmap
spring.datasource.password=roadmap
spring.kafka.bootstrap-servers=localhost:9094
eureka.client.service-url.defaultZone=http://localhost:8761/eureka/
eureka.instance.hostname=host.docker.internal
eureka.instance.prefer-ip-address=false
app.kafka.topics.roadmap-events=roadmap.events
app.clients.auth.client-id=roadmap-service
app.clients.auth.client-secret=mock
app.simulation.enabled=true
```
Los clientes que salen por el gateway ya usan `localhost:8080` por default, así que no se repiten.

### 5.9 Infra
- **eureka:** `steeltoeoss/eureka-server:4.1.1`, puerto `127.0.0.1:8761`, healthcheck sobre `/actuator/health`.
- **event-bus:** `apache/kafka:4.1.0` en KRaft.
  - Listeners: `PLAINTEXT://event-bus:29092` (interno) y `PLAINTEXT_HOST://localhost:9094` (host).
  - `AUTO_CREATE_TOPICS_ENABLE=true` y `NUM_PARTITIONS=3`.
  - Healthcheck con `kafka-topics.sh --list`.
- **kafka-init:** crea los topics oficiales de `tpi-system-compose/event-bus/init-topics.sh` (incluye los `.DLT` de cada dominio, adonde roadmap v3 manda lo no reintentable) más `roadmap.events`, `challenges.results` y `challenges.results.DLT`. Corre una vez.
- **postgres:** `postgres:16-alpine`, base, usuario y clave `roadmap`, puerto `127.0.0.1:5433:5432` y volumen `pgdata`.

### 5.10 Front
- `front/proxy.mock.conf.json` = `{"/api": {"target": "http://localhost:8080", "secure": false, "changeOrigin": true, "logLevel": "warn"}}`.
- Para levantar el front: `npx ng serve --proxy-config ../../Backend/tpi-roadmap-mocks/front/proxy.mock.conf.json` (la ruta es relativa al front; se ajusta según dónde esté clonado cada uno).

---

## 6. Escenarios de aceptación

### `scripts/smoke.sh`: curl contra :8080, sale distinto de 0 si algo falla
1. Los servicios `USERS`, `COURSE`, `ENGINE-CHALLENGE`, `BACKOFFICE` y `ROADMAP-SERVICE` están `UP` en `/_mock/registry` (espera hasta 3 min).
2. Login del profesor (login + verify), guarda la cookie, y `/me` devuelve el profesor.
3. El profesor crea la cohorte "Smoke" y dos desafíos: D1 `BASIC` y D2 `MEDIUM`.
4. En roadmap crea la sección y los nodos N1 (D1) y N2 (D2), y le pone a N2 la regla `ALL [N1]`.
5. Matricula al alumno 02 por el endpoint mock.
6. Con la cookie del alumno 02, el progreso muestra N1 `enabled` y N2 `locked`.
7. Cierra D1 desaprobado: la XP no cambia y N2 sigue `locked`.
8. Cierra D1 aprobado: la XP pasa a +100, N1 queda `completed` y N2 `enabled`. Como roadmap consume de forma asíncrona, reintenta hasta 15 s.
9. `GET /api/roadmap/courses/{id}/students/me/level` (como alumno 02) responde 200 con su nivel, lo que confirma que roadmap obtiene PAR-09 del mock de backoffice.

### Checklist manual del front (lo que justifica el repo)
- [ ] El profesor entra a `/roadmap/teacher`, ve "Programación I — Mock" y su grafo demo, y puede editar secciones, nodos y reglas.
- [ ] El alumno 01 entra a `/roadmap/student`, ve la cohorte, abre el mapa y ve el progreso y la XP.
- [ ] El alumno 01 inicia un desafío y el intento aparece en el panel. Con **Aprobar** y recargar, el nodo queda completado y se habilita el siguiente.
- [ ] Una falla 503 en `courses` desde el panel hace que el front muestre su estado de error sin romperse.

---

## 7. Orden de ejecución y reparto

La ejecución se reparte en 3 olas con workers de Antigravity orquestados con `/orchestration`. Cada worker **solo edita lo que figura en la columna "Dueño de"**.

| Ola | Tarea | Dueño de | Depende de | Acepta cuando |
|---|---|---|---|---|
| 1 | **T1 Base:** `mocks/` (Dockerfile, package.json, `lib/*`), `gateway.mjs`, compose completo (infra + **los 4 mocks como esqueleto que solo se registra en Eureka**) y `.env.example` | todo lo listado | — | `docker compose up` deja la infra healthy, los 4 esqueletos `UP` en Eureka y `/api/users/x` llega a users con los headers inyectados |
| 2 | **T2.1 users + backoffice** | `services/users.mjs`, `services/backoffice.mjs`, `docs/contratos/users.md`, `docs/contratos/backoffice.md` | T1 | Las filas de §5.4 y §5.6b responden por :8080 |
| 2 | **T2.2 courses** | `services/courses.mjs`, `docs/contratos/courses.md` | T1 | Las filas de §5.5 responden y `STUDENT_ENROLLED` llega a `courses.events` |
| 2 | **T2.3 challenges** | `services/challenges.mjs`, `docs/contratos/engine-challenge.md` | T1 | Las filas de §5.6 responden y el evento de cierre llega a `challenges.events` con el shape exacto |
| 2 | **T2.4 panel** | `mocks/panel/index.html` | T1 (contratos en §5) | El panel carga en `/_mock/` y cada botón llama al endpoint documentado |
| 3 | **T3 Integración** (coordinador): roadmap en el compose, `front/`, `flujos.http`, `smoke.sh`, `README.md` | lo listado | T2.* | §6 completo: smoke verde y checklist del front |
| 3 | T3.5 Stubs que hagan falta para que el dashboard no bloquee la navegación (si aparecen) | el servicio que corresponda | T3 | Login → `/roadmap` navegable |
| 3 | T3.6 Perfil `mock` en `tpi-roadmap` (§5.11), en la rama `feature/perfil-mock` | ese único archivo | T3 | Roadmap local con `dev,mock` + `--scale roadmap=0` queda `UP` en Eureka y el smoke pasa. El PR lo abre el equipo. |
| — | Publicar el repo en GitHub (privado) e invitar al grupo | el equipo | — | Los compañeros clonan al lado de `tpi-roadmap` y corren `docker compose up` |

El coordinador revisa cada entrega contra las reglas R1 a R14 antes de aceptarla.

---

## 8. Fuera de alcance por ahora (con su disparador)

| Qué | Cuándo sumarlo |
|---|---|
| Mocks de teórico y práctico (pantallas de intento) | Cuando queramos el flujo completo del alumno sin el panel |
| Accounting (vidas reales, `INVENTORY_CLIENT_MODE=http`) | Cuando probemos el Gate o la pantalla de inventario contra datos reales |
| Vista de eventos de `roadmap.events` en el panel | Cuando haga falta ver `NODE_COMPLETED` y `NODE_UNLOCKED` sin herramientas |
| `kafka-ui` | Cuando haya que inspeccionar topics seguido |
