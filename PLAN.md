# tpi-roadmap-mocks — Plan de desarrollo

> **El plan ejecutable, con las reglas, el alcance actualizado y el reparto de tareas, está en [`IMPLEMENTACION.md`](IMPLEMENTACION.md), y manda sobre este documento.**
> Este archivo queda como contexto: el porqué de la arquitectura. La prioridad es **levantar el front de roadmap sin depender de los otros micros**.

> Grupo 10 · Roadmap · 2026-10-03
> Stack dockerizado para levantar con un comando y probar flujos del **roadmap real** y del **frontend**
> contra versiones falsas (sin validaciones) de los micros de otros grupos.
> Es un proyecto vivo: lo actualizamos a medida que conocemos mejor los contratos de los demás grupos.
> Repo aparte de `tpi-roadmap` (herramienta interna del grupo, no se evalúa). Se clona **al lado** de `tpi-roadmap`; si está en otro lugar, setear `ROADMAP_PATH` en `.env`.

Las fuentes de cada dato están en [`docs/investigacion/`](docs/investigacion/):

- [`01-roadmap-contratos.md`](docs/investigacion/01-roadmap-contratos.md): qué consume y qué produce roadmap.
- [`02-users-gateway-infra.md`](docs/investigacion/02-users-gateway-infra.md): users, gateway, Eureka y Kafka.
- [`03-courses-desafios.md`](docs/investigacion/03-courses-desafios.md): courses, motor de desafíos y el evento de cierre con XP.
- [`04-frontend-consumo.md`](docs/investigacion/04-frontend-consumo.md): qué endpoints llama el front.

---

## 1. Objetivo

Con `docker compose up` tiene que quedar funcionando, en una sola máquina:

1. El login de un **alumno** y de un **docente** desde el front, sin 2FA ni contraseñas reales.
2. La **creación de cursos** (cohortes) y la **inscripción de alumnos**. La inscripción tiene que llegar a roadmap por Kafka.
3. La **creación de desafíos** en un motor falso. Después, el docente los asigna a nodos del roadmap desde el front.
4. El **cierre de un desafío** (aprobado o desaprobado) con su XP. Eso lo resuelve un endpoint de simulación que publica el evento real de cierre en Kafka. Así se valida que roadmap sume la XP y desbloquee nodos de a poco.

Todo pasa por un **gateway con service discovery (Eureka)**, igual que en la plataforma real.

### Fuera de alcance (a propósito)

- La seguridad real: no hay firma JWT ni Redis de sesiones ni compuertas de cuenta, porque el pedido es "sin validaciones".
- Sandbox, LLM, market, notifications, accounting y backoffice reales. Roadmap ya tiene stubs o un modo degradado para esos casos.
- Persistencia de los mocks: viven en memoria. La base de roadmap sí persiste (ver §8).

---

## 2. Arquitectura

```
                 navegador / ng serve (proxy → :8080)        curl / IntelliJ .http
                                   │                                  │
                                   ▼                                  ▼
                        ┌──────────────────────────────────────────────────┐
                        │ gateway (Node, :8080)                            │
                        │  /api/{seg}/**  →  Eureka "{seg}-service"        │
                        │  cookie fu_at / Bearer → X-Principal-Type,       │
                        │  X-User-Id, X-User-Roles | X-Service-*           │
                        └───────┬──────────┬───────────┬───────────┬──────┘
                                │          │           │           │
              ┌─────────────────┘   ┌──────┘     ┌─────┘           └──────────┐
              ▼                     ▼            ▼                            ▼
      users-service          course-service   engine-challenge-service   roadmap-service
      (mock, :8082)          (mock, :8086)    (mock, :8096)              (REAL, :8010)
      login, /me, token      cohortes,        catálogo de desafíos,      build de ../
      técnico                secciones,       simulador de cierre        + postgres
                             matrícula        (XP)                            ▲
                                │                 │                           │
                                └──── Kafka (event-bus) ──────────────────────┘
                                 courses.events     challenges.events     roadmap.events
                                 STUDENT_ENROLLED   CHALLENGE_COMPLETED   NODE_COMPLETED
                                                                          NODE_UNLOCKED
      eureka (:8761): todos los servicios se registran ahí y el gateway resuelve con él.
```

| Servicio (compose) | Nombre en Eureka | Puerto | Imagen / código | Fuente del contrato |
|---|---|---|---|---|
| `eureka` | — | 8761 | `steeltoeoss/eureka-server:4.1.1` (la que usa `tpi-system-compose`) | 02 §4 |
| `event-bus` | — | 29092 interno, 9094 host | `apache/kafka:4.1.0` KRaft (la de `tpi-system-compose`) | 02 §5 |
| `gateway` | — | **8080** (host) | `mocks/` → `services/gateway.mjs` | 02 §3 |
| `users` | `users-service` | 8082 | `mocks/` → `services/users.mjs` | 02 §1, 04 §2 |
| `courses` | `course-service` | 8086 | `mocks/` → `services/courses.mjs` | 03 §2, 04 §3.2 |
| `challenges` | `engine-challenge-service` | 8096 | `mocks/` → `services/challenges.mjs` | 03 §3.3 y §4 |
| `roadmap` | `roadmap-service` | 8010 (+8011 actuator) | `build: ${ROADMAP_PATH:-../tpi-roadmap}` (Dockerfile de ese repo, tal cual) | 01 §5 |
| `postgres` | — | 5432 | `postgres:16-alpine` | `docker/docker-compose.yml` |

**Decisión:** los cuatro mocks salen de **una sola imagen Node** (`mocks/`), cada uno con un `command` distinto. La única dependencia es `kafkajs`; el resto es `node:http` y `fetch`. Así no hay Spring ni builds largos, y sumar el mock de otro grupo es agregar un archivo.

---

## 3. Contratos que el mock TIENE que respetar

Si alguno no coincide, roadmap ignora el mensaje o responde 403 sin avisar. Estos datos no se negocian:

### 3.1 Gateway → micros (headers)
- Usuario: `X-Principal-Type: user`, `X-User-Id: <UUID>` y `X-User-Roles: STUDENT` (varios roles se separan con coma y sin espacios). Roadmap exige que `X-User-Id` sea un UUID (01 §4.1).
- Servicio: `X-Principal-Type: service`, `X-Service-Id` y `X-Service-Scopes`. No pueden ir mezclados con los `X-User-*`, porque roadmap anula la autenticación (01 §4.1).
- La ruta **no se reescribe**: `/api/roadmap/courses/...` llega igual a roadmap (02 §3.2).
- **Mock (decisión propia):** si un request **no trae token**, el gateway **deja pasar** los `X-*` que vengan. Hace falta porque roadmap llama a `/api/course/course-cohorts/{id}/membership` mandando `X-User-*` a mano (`HttpCohortOwnershipClient`). Además deja probar con curl sin login. El gateway real los descarta; acá se aceptan a propósito.

### 3.2 Sesión del front
- Login en dos pasos: `POST /api/users/public/auth/login` y después `POST /api/users/public/auth/2fa/verify` (que responde `{expiresIn}` más la cookie `fu_at` HttpOnly). Después el front llama a `GET /api/users/me` (04 §2).
- El front **no lee el JWT**: deriva todo de `/me`. Por eso `fu_at` puede ser un token **sin firmar**: base64url de `{"sub","roles","type":"user"}`. `/me` tiene que devolver `accountStatus: "ACTIVE"`, `mustChangePassword: false` y `firstLogin: false`, o el `gatesGuard` lo redirige.
- El token técnico es `POST /api/users/public/auth/token` y responde `{accessToken, tokenType, expiresIn}`. Roadmap lo pide antes de llamar al motor (01 §3.1). El token es igual de falso, con `"type":"service"`.

### 3.3 Kafka
- Envelope: `eventId` (UUID), `eventType` (MAYÚSCULAS_SNAKE), `timestamp` (ISO con `Z`; **no** epoch), `producer` y `payload`. Roadmap también acepta `event_id` y `event_type` (01 §1.1). No se usan type headers.
- `courses.events` → `STUDENT_ENROLLED` con payload `{courseCohortId, studentId, enrollmentId, validationType, enrolledAt}`. Roadmap solo lee los dos primeros (03 §2.4).
- `challenges.events` → `CHALLENGE_COMPLETED` / `CHALLENGE_ABORTED` con **`producer: "THEME-02-CHALLENGE-ENGINE"`**, que es obligatorio porque si no roadmap descarta el mensaje en DEBUG. El payload va en snake_case: `id_user`, `id_course`, `challenge_id` (todos UUID), `id_node` (opcional), `resources.xp` (entero) y `result.status` = `APPROVED` | `DISAPPROVE` (sic) (01 §1.2, 03 §4.3).
  - El mapper de roadmap es estricto: `xp` y `score` tienen que ser **enteros** (no `100.0`), y los booleanos no pueden venir como string.
- XP por dificultad (PAR-01): `BASIC/EASY=100`, `MEDIUM=250` y `ADVANCED/HARD=500`. Si el resultado es desaprobado, la XP es `0` (03 §3.3).
- Roadmap publica `NODE_COMPLETED` y `NODE_UNLOCKED` solo si `KAFKA_TOPIC_ROADMAP` tiene valor (01 §2.1). En el stack usamos `roadmap.events`.

### 3.4 Lo que roadmap necesita para que un cierre impacte
1. El alumno tiene que estar matriculado en `student_course`: si no, el cierre falla con `student.not-enrolled`. Eso lo garantiza `STUDENT_ENROLLED` (01 §1.4).
2. Tiene que existir **un nodo** en esa cohorte con ese `challengeId`. Si no hay ninguno falla con `node.not-found`, y si hay dos con `node.challenge-ambiguous` (01 §1.2).
3. El nodo no puede estar aprobado de antes (`node.already-passed`).
4. Al dar de alta el nodo, roadmap hace `GET /api/engine-challenge/challenges/{id}`: con 200 lo acepta, con 404 lo rechaza, y si hay error sigue en modo degradado (01 §3.5).

---

## 4. Estructura de la carpeta

```
tpi-roadmap-mocks/
├── PLAN.md                     ← este archivo
├── README.md                   ← cómo levantar, credenciales y flujos (se escribe en la fase 5)
├── docker-compose.yml
├── .env.example                ← perfiles de roadmap, puertos y modos de clientes
├── mocks/                      ← una imagen Node para todos los mocks
│   ├── Dockerfile
│   ├── package.json            ← única dependencia: kafkajs
│   ├── lib/
│   │   ├── http.mjs            ← mini router, lectura de JSON, cookies, respuestas
│   │   ├── eureka.mjs          ← register + heartbeat contra la REST de Eureka
│   │   └── kafka.mjs           ← publish(topic, key, envelope)
│   └── services/
│       ├── gateway.mjs
│       ├── users.mjs
│       ├── courses.mjs
│       └── challenges.mjs
├── front/
│   └── proxy.mock.conf.json    ← `ng serve --proxy-config` → todo /api a :8080
├── flujos.http                 ← requests listos para IntelliJ / VS Code REST Client
├── scripts/
│   └── smoke.sh                ← prueba de punta a punta (criterio de aceptación global)
└── docs/
    ├── investigacion/          ← los 4 informes de los agentes
    └── contratos/              ← un .md por grupo cuando sumemos o cambiemos mocks (§9)
```

---

## 5. Fases de desarrollo

Cada fase cierra con su criterio de aceptación. Las fases 2, 3 y 4 son independientes entre sí y se pueden repartir.

### Fase 0 — Infra base
- `docker-compose.yml` con `eureka`, `event-bus` y `postgres`.
- Kafka en KRaft con un listener interno `event-bus:29092` y otro para el host `localhost:9094`. Lleva `KAFKA_AUTO_CREATE_TOPICS_ENABLE=true` y `KAFKA_NUM_PARTITIONS=3`. Además, un servicio `kafka-init` crea los topics oficiales (la lista de `tpi-system-compose/event-bus/init-topics.sh`) más `roadmap.events` y `challenges.results`.
- Healthchecks en los tres servicios.
- **Acepta cuando:** `docker compose up eureka event-bus postgres` deja los tres `healthy`, `http://localhost:8761` muestra el dashboard y `kafka-topics.sh --list` incluye `courses.events`, `challenges.events` y `roadmap.events`.

### Fase 1 — Esqueleto de mocks + gateway
- `mocks/lib/eureka.mjs`:
  - Hace `POST /eureka/apps/{APP}` con `instance{hostName=<nombre del servicio en compose>, ipAddr, app, vipAddress, status:UP, port{$,@enabled}, dataCenterInfo{@class: com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo, name: MyOwn}}`.
  - Manda el heartbeat `PUT /eureka/apps/{APP}/{instanceId}` cada 30 s y se vuelve a registrar si recibe 404.
  - Al apagarse hace `DELETE`.
- `mocks/lib/http.mjs`: un router mínimo (método + path con `:params`), `json(res, status, body)`, el parseo del body y las cookies.
- `services/gateway.mjs`:
  - Toma el segmento de `/api/{seg}/...`, resuelve `{SEG}-SERVICE` en `GET /eureka/apps/{APP}` (`Accept: application/json`), elige una instancia `UP`, cachea 5 s y hace proxy del stream (método, headers y body sin tocar). Si no hay instancia responde `503` en formato problem+json.
  - Para la identidad: lee la cookie `fu_at` o `Authorization: Bearer`, decodifica el base64url, borra los `X-*` reservados e inyecta los de §3.1. Sin token, deja pasar los `X-*` que vengan (§3.1).
  - Agrega `X-Request-Id`.
  - Loguea una línea por request: `método path → servicio status ms`.
- **Acepta cuando:** al levantar un mock "echo" de prueba registrado como `echo-service`, `GET localhost:8080/api/echo/x` le llega con los headers inyectados, y aparece en el dashboard de Eureka.

### Fase 2 — `users` (users-service)
- Usuarios sembrados (los IDs empalman con la semilla de roadmap y con el `proxy.conf.json` del front):

  | Rol | Email | ID |
  |---|---|---|
  | STUDENT | `alumno@frc.utn.edu.ar` | `30000000-0000-4000-8000-000000000001` |
  | STUDENT | `alumno2@frc.utn.edu.ar` | `30000000-0000-4000-8000-000000000002` |
  | PROFESSOR | `profesor@utn.edu.ar` | `2db91e4f-a408-4b4f-85ec-a68804984cad` |
  | GESTOR | `gestor@utn.edu.ar` | `c0ffee00-aaaa-4bbb-8ccc-ddddeeeeffff` |
  | ADMIN | `admin@utn.edu.ar` | `00000000-0000-0000-0000-000000000001` |

- Endpoints:
  - `POST /api/users/public/auth/login`: acepta **cualquier contraseña** y responde `{challengeId, message}`. Si el email no existe, responde `401`.
  - `POST /api/users/public/auth/2fa/verify`: acepta **cualquier código**, setea las cookies `fu_at` y `fu_rt` (`HttpOnly; Path=/; SameSite=Lax`) y responde `{expiresIn: 3600}`.
  - `POST /api/users/public/auth/refresh` y `POST /api/users/auth/logout`, este último limpia las cookies.
  - `GET /api/users/me` y `PATCH /api/users/me/onboarding`.
  - `GET /api/users` y `GET /api/users/profile/{id}`.
  - `POST /api/users/public/auth/token`: el token técnico para roadmap.
  - Extra mock: `POST /api/users/mock/users` para crear un usuario en caliente.
- **Acepta cuando:** pasando por el gateway, login, verify y `/me` devuelven el alumno, y `/api/users/public/auth/token` devuelve un `accessToken`.

### Fase 3 — `courses` (course-service)
- Estado en memoria: instituciones, cursos base, cohortes, secciones, matrículas y profesores por cohorte.
- Semilla: la cohorte `10000000-0000-4000-8000-000000000001` ("Programación I — Mock", `ACTIVE`) con el profesor sembrado y los alumnos 1 y 2 matriculados.
- Endpoints (shapes de 04 §3.2):
  - `GET /api/course/institution` y `GET/POST /api/course/course-base`.
  - `POST /api/course/course-cohorts`: la cohorte nace **`ACTIVE`**, sin calibración, con `invitationCode` generado y el creador como profesor. Publica `COURSE_COHORT_ACTIVATED`.
  - `GET /api/course/course-cohorts/me` y `GET /api/course/course-cohorts/{id}` (este último no existe en el real; lo agregamos porque el front lo pide).
  - `GET /api/course/course-cohorts/{id}/membership`: responde `canWrite: true` para cualquier docente, gestor o admin, sin validar.
  - `GET/POST /api/course/course-cohorts/{id}/sections`.
  - `POST /api/course/enrollments {invitationCode}` y `GET /api/course/enrollments/me`.
  - Extra mock: `POST /api/course/mock/course-cohorts/{id}/students {studentId}` para inscribir a cualquiera sin código.
- Eventos: cada matrícula publica `STUDENT_ENROLLED` (key `enrollmentId`, producer `tema-02-cursos-matricula`). **Al arrancar** se republican las matrículas sembradas; como roadmap hace upsert, es idempotente.
- **Acepta cuando:** crear una cohorte e inscribir un alumno deja el evento en `courses.events`, y ese alumno ya puede consultar `GET /api/roadmap/courses/{id}/students/{studentId}/progress` sin `student.not-enrolled`. Con la cohorte sin roadmap todavía, roadmap puede devolver 404 de curso, y eso está bien.

### Fase 4 — `challenges` (engine-challenge-service): catálogo + simulador de XP
- Catálogo en memoria. Se siembran los 11 desafíos de la semilla demo de roadmap (`40000000-0000-4000-8000-0000000000NN`, con NN de 01 a 11) para que el perfil `demo` funcione de entrada.
- Endpoints:
  - `POST /api/engine-challenge/challenges {title, description, type: THEORETICAL|PRACTICAL, difficulty: BASIC|MEDIUM|ADVANCED, mandatory}`: responde con `id` (UUID) y `status: PUBLISHED`.
  - `GET /api/engine-challenge/challenges?status=PUBLISHED` → `{content:[...]}`, y `GET /api/engine-challenge/challenges/{id}` → 200 o 404. Las dos las consume roadmap.
  - **Simulador:** `POST /api/engine-challenge/mock/attempts/close`, con body `{studentId, courseId, challengeId, nodeId?, approved: true|false, score?, xp?, aborted?}`:
    - Arma y publica el **evento v3 completo** de 03 §4.3: key `id_user`, producer `THEME-02-CHALLENGE-ENGINE`, `eventType` `CHALLENGE_COMPLETED` (o `CHALLENGE_ABORTED` si `aborted`).
    - Si no viene `xp`, la toma de la dificultad del desafío cuando está aprobado, y vale 0 si no. `subtract_live` es `!approved`.
    - Devuelve el envelope publicado para poder verlo.
- **Acepta cuando:** si se cierra aprobado un desafío asignado a un nodo, el progreso del alumno pasa ese nodo a `completed`, `xpTotal` sube con la XP y los nodos que dependían de él quedan `enabled`. Si se cierra desaprobado, `xpTotal` no cambia y no se desbloquea nada.

### Fase 5 — roadmap real + front + documentación
- Servicio `roadmap` en compose con `build: ${ROADMAP_PATH:-../tpi-roadmap}` (el clon de roadmap al lado de este repo, así se prueba la rama local), `depends_on` (postgres healthy, event-bus healthy, eureka) y estas variables (01 §5.3):
  ```env
  SPRING_PROFILES_ACTIVE=${ROADMAP_PROFILES:-dev}      # "dev,demo" para la semilla de 12 alumnos y 11 desafíos
  DB_URL=jdbc:postgresql://postgres:5432/roadmap
  KAFKA_BOOTSTRAP=event-bus:29092
  KAFKA_TOPIC_ROADMAP=roadmap.events
  EUREKA_URL=http://eureka:8761/eureka/
  EUREKA_PREFER_IP_ADDRESS=false
  EUREKA_INSTANCE_HOSTNAME=roadmap                      # el default de redes preferidas es "100." (Tailscale); por eso va hostname
  GATEWAY_URL=http://gateway:8080
  ROADMAP_TECHNICAL_CLIENT_ID=roadmap-service
  ROADMAP_TECHNICAL_CLIENT_SECRET=mock
  MOTOR_CLIENT_MODE=http
  COURSES_CLIENT_MODE=http
  COURSES_CATALOG_MODE=stub
  COURSES_SECTIONS_CLIENT_MODE=stub
  INVENTORY_CLIENT_MODE=stub
  SIMULATION_ENABLED=${SIMULATION_ENABLED:-false}
  ```
- `front/proxy.mock.conf.json`: manda `/api` a `http://localhost:8080` con `changeOrigin` y sin headers fijos, porque la identidad la pone el gateway según la cookie.
- `flujos.http` con los escenarios de §6 y `scripts/smoke.sh`, que corre el escenario A completo con `curl` y `grep` y sale distinto de 0 si algo falla.
- `README.md`: cómo levantar, credenciales, cómo resetear y cómo usarlo desde el front (`ng serve --proxy-config ../../Backend/tpi-roadmap-mocks/front/proxy.mock.conf.json`, ajustando la ruta relativa).
- **Acepta cuando:** `docker compose up -d --build` en una máquina limpia levanta todo, `scripts/smoke.sh` termina OK y en el front se puede loguear el docente, armar un nodo con un desafío del mock, loguear al alumno y ver el desbloqueo después del cierre simulado.

### Fase 6 (opcional, cuando haga falta)
- Un `kafka-ui` (`provectuslabs/kafka-ui`) bajo `profiles: [tools]` para mirar los topics desde el navegador.
- Mock de `backoffice-service` (`GET /api/backoffice/parameters` con PAR-01, PAR-09 y PAR-12) si los niveles o las vidas lo empiezan a necesitar. Hoy roadmap cae a defaults.
- Mock de `accounting-service` (`lives-availability`, `equip-summary`) para pasar `INVENTORY_CLIENT_MODE=http` y probar el Gate con vidas reales.
- Que el mock de courses consuma `roadmap.events` y loguee `NODE_COMPLETED` y `NODE_UNLOCKED`, para verlos sin herramientas.

---

## 6. Escenarios de prueba (van a `flujos.http` y `smoke.sh`)

**A. Desbloqueo progresivo (el principal)**
1. El docente se loguea y crea la cohorte "Mock POO". Queda `ACTIVE` con su `invitationCode`.
2. El docente crea dos desafíos en el motor mock: D1 (`BASIC`) y D2 (`MEDIUM`).
3. En roadmap, el docente crea la sección "Unidad 1", el nodo N1 (`THEORETICAL_CHALLENGE`, `challengeId`=D1) y el nodo N2 (`PRACTICAL_CHALLENGE`, `challengeId`=D2), y le pone a N2 la regla `ALL [N1]`.
4. El alumno se inscribe con el `invitationCode`. Se publica `STUDENT_ENROLLED` y roadmap lo matricula.
5. En el progreso del alumno, N1 está `enabled` y N2 `locked`.
6. Se cierra D1 **desaprobado**: la XP sigue en 0 y N2 sigue `locked`.
7. Se cierra D1 **aprobado**: la XP pasa a 100, N1 queda `completed` y N2 `enabled`. Aparecen `NODE_COMPLETED` y `NODE_UNLOCKED` en `roadmap.events`.
8. Se cierra D2 aprobado: la XP llega a 350.

**B. Reglas OR:** N3 con `ANY [N1, N2]` se desbloquea cuando cualquiera de los dos está aprobado.

**C. Semilla demo:** con `ROADMAP_PROFILES=dev,demo`, la cohorte `1000…0001` ya trae 12 alumnos con progreso variado. El alumno 1 (sin intentos) sirve para cerrar desafíos `4000…00NN`.

**D. Idempotencia:** si se reenvía el mismo `eventId` (el simulador acepta `eventId` opcional), la XP no se suma dos veces.

---

## 7. Decisiones y por qué

| Decisión | Motivo |
|---|---|
| Gateway propio en Node y no el `tpi-api-gateway` real | El real exige RS256 + JWKS + Redis + 3 claims de compuertas. El pedido es "sin validaciones", y uno simple deja ver y tocar los headers. |
| Token sin firmar (base64url JSON) | El front no lee el JWT (04 §2.1) y nadie más lo valida en el mock. |
| Una imagen Node para todos los mocks | Una sola dependencia (`kafkajs`) y un build. Sumar un grupo es sumar un archivo. |
| Estado de mocks en memoria | Alcanza para probar flujos y evita bases extra. Al reiniciar se resiembra. |
| Roadmap **real** y no mockeado | Es lo que queremos probar. Se buildea desde `ROADMAP_PATH` (default `../tpi-roadmap`) con el Dockerfile de ese repo. |
| Kafka y Eureka con las mismas imágenes que `tpi-system-compose` | Así lo que funciona acá funciona en la integración. |
| Endpoints extra bajo `/mock/` | Separan lo que **no** existe en el micro real (inscripción directa, cierre simulado). |

---

## 8. Riesgos conocidos

- **Desincronización al reiniciar:** los mocks se resiembran, pero la base de roadmap persiste en un volumen. Una cohorte creada a mano desaparece del mock de courses y su roadmap queda en la base. Para empezar de cero: `docker compose down -v`.
- **Registro de roadmap en Eureka:** si no aparece como `UP`, revisar `EUREKA_INSTANCE_HOSTNAME`. También puede que el readiness siga `OUT_OF_SERVICE` mientras corre Flyway.
- **`kafkajs` contra Kafka 4.x:** Kafka 4 sacó versiones viejas del protocolo. Si falla la producción, primero pinear el broker a `apache/kafka:3.9.1` (el broker no afecta los contratos).
- **El `pom` de roadmap corre PMD/Checkstyle** en `package`. El Dockerfile ya copia `.code_quality`, pero si una regla rompe el build hay que arreglar el código o el Dockerfile, no el mock.
- **Contratos que cambian:** cuando otro grupo cambie su evento o endpoint, se actualiza su mock y `docs/contratos/<grupo>.md` (§9).

---

## 9. Cómo vamos a ir extendiéndolo

Para agregar o actualizar el mock de otro grupo (por ejemplo accounting):
1. Escribir `docs/contratos/<micro>.md` con los endpoints y eventos **citando el repo del grupo** (`archivo:línea`).
2. Crear `mocks/services/<micro>.mjs`, registrarlo en Eureka como `<segmento>-service` y usar `lib/http.mjs` y `lib/kafka.mjs`.
3. Sumarlo a `docker-compose.yml` (misma imagen, otro `command`). **El gateway no se toca**: lo resuelve solo por el nombre en Eureka.
4. Si roadmap tiene un cliente en modo `stub` para ese micro, pasarlo a `http` en `.env.example`.
5. Agregar el escenario en `flujos.http` y, si es crítico, en `smoke.sh`.

Regla: los endpoints que existen en el micro real copian su path y su shape. Lo que solo sirve para probar va bajo `/api/<seg>/mock/...`.
