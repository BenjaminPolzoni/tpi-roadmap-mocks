# Guía de Inicio Rápido y Uso de `tpi-roadmap-mocks`

> 🚀 **Bienvenido al stack de mocks del Grupo 10.** Esta guía paso a paso te explica cómo clonar, levantar y utilizar el entorno local para desarrollar e integrar la aplicación sin depender de otros equipos.

---

## a) ¿Qué es y para qué sirve?

**`tpi-roadmap-mocks`** es el entorno de desarrollo e integración del Grupo 10. Su propósito principal es **permitir levantar el frontend de Roadmap con `ng serve` (hot reload) y probar todos nuestros flujos y pantallas de punta a punta sin depender de que los otros grupos de la cátedra tengan sus microservicios encendidos** ni de configuraciones de red complejas (como Tailscale).

Con un solo comando de Docker Compose, el stack provee la infraestructura completa (Gateway, Eureka, Kafka en KRaft y PostgreSQL), nuestro microservicio **Roadmap real** y **mocks deterministas** de los servicios que consumimos (Users, Courses, Engine Challenge y Backoffice), además de un **panel de control web** para cambiar de usuario con un clic, aprobar desafíos y simular fallas.

---

## b) Requisitos Previos

Antes de comenzar, asegúrate de contar con lo siguiente en tu máquina:

1. **Aceptar la invitación de colaborador:** El repositorio se aloja como repo privado en [https://github.com/BenjaminPolzoni/tpi-roadmap-mocks](https://github.com/BenjaminPolzoni/tpi-roadmap-mocks). Debes aceptar la invitación que recibiste en tu email o en las notificaciones de GitHub antes de clonar.
2. **Docker y Docker Compose:**
   - **Windows / macOS:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (asegúrate de que esté iniciado y corriendo en modo Linux Containers, con al menos 4 GB de memoria recomendada).
   - **Linux:** Docker Engine + Docker Compose v2 (`docker-compose-plugin`).
3. **Git:** En Windows se recomienda utilizar **Git Bash** (incluido con Git for Windows).
4. **Node.js (v18+ o v20 LTS recomendado) + npm:** Necesario para levantar el frontend.
5. **Angular CLI:** Instalado globalmente (`npm install -g @angular/cli`) o ejecutado mediante `npx ng`.
6. **JDK 21 (Solo para Modo IDE):** Si únicamente vas a levantar todo con Docker, **no necesitas Java instalado**. Solo lo requieres si vas a ejecutar o depurar `tpi-roadmap` localmente desde tu IDE (IntelliJ IDEA / VS Code) o terminal.
7. **cURL y Bash:** Para ejecutar el smoke test (disponibles de forma nativa en Linux/macOS y dentro de Git Bash en Windows).

---

## c) Estructura de Carpetas Esperada

Por defecto, la configuración de Docker Compose asume que **`tpi-roadmap-mocks` se clona AL LADO de `tpi-roadmap`** (ambos dentro de la misma carpeta contenedora, habitualmente `Backend/`). El frontend suele ubicarse en `Frontend/`:

```text
MiProyecto/ (o RepoDeProfes / Workspace)
├── Backend/
│   ├── tpi-roadmap/            <-- Repositorio oficial del microservicio Roadmap
│   └── tpi-roadmap-mocks/      <-- Este repositorio (clonado al lado de tpi-roadmap)
└── Frontend/
    └── 2026-PIV-TPI-FE/        <-- Repositorio del frontend Angular
```

### ¿Qué pasa si `tpi-roadmap` está en otra ruta?
Si en tu equipo `tpi-roadmap` se encuentra en una ubicación distinta, no modifiques `docker-compose.yml`. Simplemente crea un archivo `.env` a partir del ejemplo:

- **En PowerShell o Bash:**
  ```bash
  cp .env.example .env
  ```
- **En CMD:**
  ```cmd
  copy .env.example .env
  ```

Edita `.env` y define la variable `ROADMAP_PATH` apuntando a tu carpeta de `tpi-roadmap`:
```env
ROADMAP_PATH=C:/MisProyectos/tpi-roadmap
```
*(Tip: En Windows usa barras inclinadas `/` para evitar problemas de escape de rutas).*

---

## d) Primera Vez: Paso a Paso Numerado

Sigue este procedimiento la primera vez que configures el entorno:

### 1. Clonar este repositorio
Ubícate en tu carpeta de `Backend/` (al lado de `tpi-roadmap`) y clona el repositorio:
```bash
cd Backend
git clone https://github.com/BenjaminPolzoni/tpi-roadmap-mocks.git
cd tpi-roadmap-mocks
```

### 2. Actualizar repositorios hermanos a la última versión
Asegúrate de tener los últimos cambios de `develop` tanto en el backend como en el frontend:

- En `tpi-roadmap`:
  ```bash
  cd ../tpi-roadmap
  git checkout develop
  git pull
  ```
- En el frontend (`2026-PIV-TPI-FE`):
  ```bash
  cd ../../Frontend/2026-PIV-TPI-FE
  git checkout develop
  git pull
  ```
- Regresa a `tpi-roadmap-mocks`:
  ```bash
  cd ../../Backend/tpi-roadmap-mocks
  ```

### 3. Levantar el stack completo
Ejecuta el siguiente comando para construir las imágenes y levantar los contenedores en segundo plano:
```bash
docker compose up -d --build
```
> ⏳ **Nota:** La primera vez este comando compilará la imagen de los mocks en Node 22 y el JAR de `tpi-roadmap` (mediante Maven en un contenedor multi-stage). Puede tardar entre 2 y 5 minutos según tu conexión a internet y CPU.

### 4. Verificar que el stack esté listo
El microservicio `roadmap` tarda aproximadamente 25 a 35 segundos en arrancar, conectar a Postgres y Kafka, y registrarse en Eureka. Puedes verificar que todo esté en verde de dos formas:

- **Desde el navegador:**
  - Abre el JSON de registro: [http://localhost:8080/_mock/registry](http://localhost:8080/_mock/registry)
  - O abre el Panel de Control: [http://localhost:8080/_mock/](http://localhost:8080/_mock/)
  - Debes ver los **5 servicios en estado `UP`**:
    1. `USERS-SERVICE`
    2. `COURSE-SERVICE`
    3. `ENGINE-CHALLENGE-SERVICE`
    4. `BACKOFFICE-SERVICE`
    5. `ROADMAP-SERVICE`
- **Desde la terminal:**
  ```bash
  curl -s http://localhost:8080/_mock/registry
  curl -s http://localhost:8080/api/roadmap/public/ping
  ```
  *(El ping debe responder `{"data":{"status":"UP"},"success":true,...}`).*

### 5. Ejecutar el Smoke Test E2E de validación
Para confirmar que todo el circuito funciona de punta a punta:

- En **Git Bash** (Windows) o **terminal Unix** (Linux/macOS):
  ```bash
  bash scripts/smoke.sh
  ```
- El script ejecutará automáticamente 9 pasos que validan registro, autenticación, creación de cohortes, desafíos, nodos en roadmap, matrículas, eventos asíncronos en Kafka y consultas de nivel. Debe finalizar con:
  ```text
  === TODOS LOS PASOS 1-9 COMPLETADOS EXITOSAMENTE ===
  ```

---

## e) Conectar el Frontend Angular

Una vez que el stack de mocks está corriendo, conecta el frontend:

### 1. Iniciar Angular con el Proxy de Mocks
Abre una terminal en la carpeta de tu frontend (ej. `Frontend/2026-PIV-TPI-FE/`) y ejecuta:

- **Con Angular CLI global:**
  ```bash
  ng serve --proxy-config ../../Backend/tpi-roadmap-mocks/front/proxy.mock.conf.json
  ```
- **O con npx (sin instalar CLI global):**
  ```bash
  npx ng serve --proxy-config ../../Backend/tpi-roadmap-mocks/front/proxy.mock.conf.json
  ```
*(Ajusta la ruta relativa al archivo `proxy.mock.conf.json` si tu estructura de carpetas difiere).*

> ℹ️ **¿Qué hace este proxy?**
> Redirige todas las llamadas `/api/**` que hace el front en `http://localhost:4200` hacia el Gateway de los mocks en `http://localhost:8080`, transmitiendo cookies y cabeceras de identidad de forma transparente.

### 2. Abrir la aplicación
Abre tu navegador en:
👉 [http://localhost:4200](http://localhost:4200)

### 3. Credenciales sembradas
Los mocks de autenticación aceptan **cualquier contraseña** (ej. `mock`) y **cualquier código 2FA** (ej. `123456`):

| Rol | Email | UUID | Notas de uso |
|---|---|---|---|
| **Profesor** | `profesor@utn.edu.ar` | `2db91e4f-a408-4b4f-85ec-a68804984cad` | Docente de la cohorte demo. Crea y edita nodos, secciones y reglas. |
| **Alumno 01** | `alumno01@frc.utn.edu.ar`<br>*(o `alumno@frc.utn.edu.ar`)* | `30000000-0000-4000-8000-000000000001` | Alumno matriculado limpio (**0 XP**). **Ideal para probar desbloqueos progresivos desde cero.** |
| **Alumno 02** | `alumno02@frc.utn.edu.ar` | `30000000-0000-4000-8000-000000000002` | Matriculado en la cohorte demo (usado en el smoke test; inicia con 0 vidas). |
| **Alumnos 03..12** | `alumno03@frc.utn.edu.ar` ... | `30000000-0000-4000-8000-0000000000NN` | Alumnos con diferentes estados de avance. |
| **Gestor** | `gestor@utn.edu.ar` | `c0ffee00-aaaa-4bbb-8ccc-ddddeeeeffff` | Gestor asignado a la cohorte demo. |
| **Admin** | `admin@utn.edu.ar` | `00000000-0000-0000-0000-000000000001` | Administrador con visibilidad total. |

### 4. Atajo rápido: "Entrar como" desde el Panel
Para no tener que completar el formulario de login y 2FA cada vez:
1. Abre [http://localhost:8080/_mock/](http://localhost:8080/_mock/).
2. En la sección **(2) Sesión e Identidad**, ubica el usuario con el que deseas probar (ej. Profesor o Alumno 01) y presiona el botón **"Entrar como"**.
3. Como el Gateway (`:8080`) y el Front (`:4200`) comparten el dominio `localhost`, la cookie de sesión queda configurada.
4. **Paso indispensable:** Vuelve a la pestaña del front (`http://localhost:4200`) y **presiona F5 (recargar página)**. Ingresarás inmediatamente autenticado con ese rol.

---

## f) Probar el Desbloqueo Progresivo desde la UI (Receta Corta)

El flujo típico de validación de Roadmap consiste en:

### Paso 1: Configuración como Profesor
1. En el panel ([http://localhost:8080/_mock/](http://localhost:8080/_mock/)), pulsa **"Entrar como"** en el **Profesor**.
2. En el front (`http://localhost:4200`), recarga y ve a `/roadmap/teacher`.
3. Verás la cohorte demo: **"Programación I — Mock"** (ID: `10000000-0000-4000-8000-000000000001`, código: `PROG1-MOCK`).
4. Entra al constructor de la cohorte (`/roadmap/teacher/build/10000000-0000-4000-8000-000000000001`). Puedes agregar secciones, nodos o modificar reglas de prerrequisitos (o usar el árbol ya sembrado).
   - *Tip:* Los desafíos demo están publicados y tienen IDs fijos desde `40000000-0000-4000-8000-000000000001` hasta `...0011`. En la sección **(4) Desafíos** del panel puedes copiar cualquiera de estos IDs con un clic para pegarlo en el wizard de creación de nodo.

### Paso 2: El Alumno visualiza su Roadmap
1. En el panel, haz clic en **"Entrar como"** en **Alumno 01** (`alumno01@frc.utn.edu.ar`).
2. En el front, recarga y ve a `/roadmap/student`.
3. Abre el mapa de la cohorte: verás el primer nodo disponible (desbloqueado) y los siguientes con candado (bloqueados por prerrequisito).
4. Haz clic en el nodo habilitado y pulsa el botón para **iniciar el desafío**.

### Paso 3: Simular la Aprobación desde el Panel
Dado que las pantallas internas de resolución de desafíos pertenecen a otros grupos, el cierre del intento se realiza desde el panel:
1. Abre el panel en [http://localhost:8080/_mock/](http://localhost:8080/_mock/) y baja a la sección **(5) Intentos y Cierre de Desafíos**.
2. En la tabla de intentos verás el intento recién creado en estado `IN_PROGRESS`.
3. Haz clic en el botón verde **"Aprobar"** (o **"Desaprobar"** si deseas verificar que no se desbloquee ni sume XP).
4. El mock emitirá el evento oficial `CHALLENGE_COMPLETED` a Kafka (topic `challenges.events`).

### Paso 4: Comprobar el Desbloqueo
1. Vuelve a la pestaña del alumno en el front y **recarga la pantalla**.
2. Roadmap habrá consumido el evento de Kafka:
   - El nodo resuelto ahora se muestra como **completado (completed)**.
   - El contador de XP del alumno se habrá incrementado (ej. +100 o +250 XP).
   - El nodo subsiguiente se habrá **desbloqueado automáticamente (enabled)**.

> 💡 **Formulario de Cierre Directo:** Si no deseas iniciar el desafío desde la UI, en la misma sección (5) del panel cuentas con un formulario para enviar un cierre directo indicando el `studentId`, `courseId`, `challengeId` y si fue aprobado o desaprobado.

---

## g) Modo IDE (Debug de Roadmap en IntelliJ / Terminal)

Si necesitas hacer cambios en el código Java de `tpi-roadmap`, poner breakpoints o depurar peticiones:

### 1. Detener el contenedor de Roadmap en Docker
Mantén corriendo toda la infraestructura y los mocks, pero apaga el contenedor de roadmap para liberar el servicio:
```bash
docker compose up -d --scale roadmap=0
```

### 2. Verificar el archivo `application-mock.properties` en `tpi-roadmap`
Para conectarse a la base de datos de Postgres en el puerto `5433` y a Kafka en el puerto `9094`, `tpi-roadmap` requiere un perfil específico.
- Revisa si en `tpi-roadmap` existe el archivo:
  `src/main/resources/application-mock.properties`
- **Nota sobre el PR:** Este archivo se incorpora mediante el PR de la rama `feature/perfil-mock`. Si aún no está mergeado en `develop` (pero la rama ya está publicada), puedes traerlo con:
  ```bash
  git checkout origin/feature/perfil-mock -- src/main/resources/application-mock.properties
  ```
  O crearlo manualmente en `tpi-roadmap/src/main/resources/application-mock.properties` con este contenido:
  ```properties
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

### 3. Ejecutar Roadmap localmente

- **Desde IntelliJ IDEA:**
  1. Abre el proyecto `tpi-roadmap`.
  2. Edita la configuración de inicio (**Run/Debug Configurations**) de `Application` (`com.utn.tpi.roadmap.Application`).
  3. En **Active Profiles** (o en Environment variables con `SPRING_PROFILES_ACTIVE`), ingresa:
     ```text
     dev,mock
     ```
  4. Inicia en modo **Debug** (Shift + F9).

- **Desde la Terminal (en la carpeta `tpi-roadmap`):**
  - **En PowerShell (Windows):**
    ```powershell
    $env:JAVA_HOME = "C:\Program Files\OpenJDK\jdk-21"   # Ajustar a la ruta de tu JDK 21
    .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev,mock" "-DskipTests"
    ```
  - **En Bash (Linux / macOS / Git Bash):**
    ```bash
    ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev,mock -DskipTests
    ```

El Gateway redirigirá el tráfico automáticamente al Roadmap de tu IDE porque se registra en Eureka con el host `host.docker.internal`.

### 4. Volver al modo normal (Roadmap en contenedor)
Cuando termines de depurar:
1. Detén la ejecución local en IntelliJ o la terminal.
2. En `tpi-roadmap-mocks`, vuelve a levantar el servicio en Docker:
   ```bash
   docker compose up -d
   ```

---

## h) Uso Diario y Comandos Útiles

Comandos habituales para trabajar día a día:

| Acción | Comando |
|---|---|
| **Levantar todo el entorno** | `docker compose up -d` |
| **Apagar el entorno (conservando datos)** | `docker compose stop` |
| **Reanudar el entorno** | `docker compose start` *(o `docker compose up -d`)* |
| **Ver logs de Roadmap en vivo** | `docker compose logs -f roadmap` |
| **Ver logs de un mock específico** | `docker compose logs -f gateway` *(o `users`, `courses`, `challenges`, `backoffice`)* |
| **Reconstruir Roadmap tras un pull o cambio de rama** | `docker compose up -d --build roadmap` |
| **Resetear todo el entorno desde cero (borrar BD y estado)** | `docker compose down -v`<br>`docker compose up -d --build` |

### Perfiles de Roadmap y republicación de matrículas:
- **`ROADMAP_PROFILES=dev,demo` (por defecto):** Roadmap siembra automáticamente la cohorte demo con 12 alumnos mediante `DemoDataSeeder`. Por eso, `PUBLISH_SEED_ENROLLMENTS` está en `false` en `courses` (para no generar colisiones de clave primaria).
- **`ROADMAP_PROFILES=dev` (sin semilla demo):** Si arrancas Roadmap limpio, define en tu `.env`:
  ```env
  ROADMAP_PROFILES=dev
  PUBLISH_SEED_ENROLLMENTS=true
  ```
  De esta forma, el mock de cursos emitirá las matrículas iniciales vía Kafka al arrancar.
- ⚠️ **Importante:** Cualquier cambio en los perfiles o en estas variables requiere resetear los volúmenes con `docker compose down -v`.

---

## i) Problemas Comunes y Soluciones (Troubleshooting)

### 1. Error de puerto ocupado (`port is already allocated`)
Los puertos publicados en `localhost` son:
- `8080`: API Gateway
- `8761`: Eureka Server
- `9094`: Kafka Broker (externo)
- `5433`: PostgreSQL de Roadmap *(se usa 5433 intencionalmente para no colisionar con un Postgres local en 5432)*

**Solución:** Identifica el proceso que retiene el puerto y ciérralo:
- En PowerShell:
  ```powershell
  Get-NetTCPConnection -LocalPort 8080, 8761, 9094, 5433 -ErrorAction SilentlyContinue | Format-Table LocalAddress, LocalPort, OwningProcess, State
  ```
- O detén otros contenedores que puedan haber quedado corriendo de proyectos anteriores (`docker ps`).

### 2. Roadmap aparece `DOWN` en Eureka o tarda en responder
Spring Boot toma unos 25 a 35 segundos en arrancar, levantar el contexto, conectar a Postgres/Kafka y registrarse en Eureka.
**Solución:** Espera medio minuto. Puedes monitorear el progreso con `docker compose logs -f roadmap`. Si ves errores de compilación o base de datos, revisa los logs.

### 3. El frontend muestra error 401 o redirige al Login
Las cookies de sesión expiran tras 1 hora o al reiniciar el navegador.
**Solución:** Ve al panel ([http://localhost:8080/_mock/](http://localhost:8080/_mock/)), pulsa **"Entrar como"** en el usuario con el que estés trabajando y recarga la pestaña del frontend con **F5**.

### 4. Error 503 `service-unavailable`
Ocurre por dos motivos:
- **El microservicio no está contemplado:** Si una pantalla del front llama a un microservicio sin mock (ej. accounting), el Gateway devuelve un error 503 indicando que `<servicio>-service no está registrado`.
- **Falla simulada activa:** En la sección (1) del panel se puede haber inyectado una falla 503 o de latencia.
**Solución:** Abre el panel web en [http://localhost:8080/_mock/](http://localhost:8080/_mock/) y haz clic en el botón verde **"Normal"** del servicio para restaurarlo.

### 5. En Git Bash (Windows), `docker exec` falla o deforma rutas
Git Bash convierte automáticamente rutas como `/bin/bash` a rutas estilo Windows (ej. `C:/Program Files/Git/bin/bash`), rompiendo comandos dentro de los contenedores.
**Solución:** Antepone `MSYS_NO_PATHCONV=1` al comando:
```bash
MSYS_NO_PATHCONV=1 docker compose exec roadmap /bin/sh
```

### 6. Modifiqué un mock pero los cambios no se ven
Los mocks corren en Node.js dentro de contenedores Docker.
**Solución:** Reconstruye el contenedor del servicio editado:
```bash
docker compose up -d --build gateway       # o users, courses, challenges, backoffice
```

---

## j) Cómo Contribuir (Reglas Clave y Flujo Git)

Si vas a agregar endpoints, modificar respuestas o sumar el mock de otro microservicio, sigue estas **reglas obligatorias** (definidas en `IMPLEMENTACION.md` §1):

1. **R1 — No modificar otros repositorios:** No toques código de `tpi-roadmap` ni del frontend. La integración se resuelve aquí. *(Única excepción: el archivo de perfil `application-mock.properties` en `tpi-roadmap`, que entra por PR).*
2. **R2 — Fidelidad absoluta de contratos:** Si un endpoint existe en el microservicio real, imita exactamente el método HTTP, la URL, el código de estado y la estructura JSON (mismo casing y nombres de campos). Cita la fuente en `docs/contratos/<micro>.md` con `archivo:línea` y commit de referencia.
3. **R3 — Rutas de mock bajo `/api/<seg>/mock/**`:** Todo endpoint que no exista en el servicio real (para testing, inspeccionar estado o inyectar eventos) debe vivir bajo ese prefijo. Nunca inventes rutas fuera de `/mock/`.
4. **R4 — Sin validaciones de negocio:** No implementes lógica de contraseñas ni chequeos complejos. Devuelve datos deterministas; responde 404 si no existe el ID y 400 si falta un dato indispensable.
5. **R5 — IDs fijos y deterministas:** Utiliza siempre los UUIDs fijos de la semilla para usuarios, cohortes y desafíos demo (§3 de `IMPLEMENTACION.md`).
6. **R6 — Eventos Kafka con Contrato v3:** Todo evento publicado debe usar el envelope v3:
   ```json
   {
     "eventId": "...",
     "eventType": "NOMBRE_EVENTO",
     "eventVersion": 1,
     "timestamp": "2026-10-04T00:00:00.000Z",
     "producer": "...",
     "payload": { ... }
   }
   ```
   ⚠️ **`eventVersion` debe ser obligatoriamente el entero `1`**. Sin él, Roadmap descarta el evento.
7. **R7 — Simplicidad tecnológica:** Node.js 22 nativo con módulos ESM (`.mjs`), `node:http` y `kafkajs`. Sin TypeScript, sin frameworks ni etapas de build complejas.
8. **R14 — Smoke test en verde:** Antes de dar por terminado cualquier cambio, ejecuta `bash scripts/smoke.sh` y asegúrate de que todos los pasos pasen en verde.

### Flujo Git sugerido:
1. Crea una rama en este repositorio:
   ```bash
   git checkout -b feature/nuevo-endpoint-courses
   ```
2. Realiza tus modificaciones y valida con `bash scripts/smoke.sh`.
3. Crea un Pull Request para que tus compañeros puedan revisarlo y probarlo.
