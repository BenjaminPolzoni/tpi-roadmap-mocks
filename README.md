# tpi-roadmap-mocks — Stack de Mocks e Integración E2E para Roadmap

> 💡 **Si es tu primera vez, empezá por [INSTRUCCIONES.md](INSTRUCCIONES.md) para la guía paso a paso de instalación, configuración y uso.**
> 📋 Lo que el mock todavía no cubre está en [DEUDA.md](DEUDA.md).

## 0. Objetivo

El propósito de este repositorio es permitir **levantar el frontend de Roadmap con `ng serve` (hot reload) y probar todos nuestros flujos y pantallas sin depender de que los otros grupos tengan sus microservicios encendidos**.

Con un único comando, el entorno provee:
- API Gateway inteligente con Eureka Discovery Server.
- **Nuestro microservicio Roadmap real** corriendo en contenedor o depurable en IDE.
- Mocks deterministas de **Users** (identidad/2FA), **Courses** (cohortes y matrículas), **Engine Challenge** (catálogo y simulador de intentos) y **Backoffice** (parámetros globales PAR).
- Panel de control web en `http://localhost:8080/_mock/` para alternar usuarios, simular aprobaciones de desafíos e inyectar fallas de red.

---

## 1. Requisitos

- **Docker y Docker Compose** (Docker Desktop en Windows/Mac o docker-ce en Linux).
- **Bash y cURL** (Git Bash o terminal Unix para ejecutar el smoke test).
- Repositorio **`tpi-roadmap`** clonado al lado de esta carpeta (por defecto en `../tpi-roadmap`, configurable vía `ROADMAP_PATH`).

---

## 2. Cómo Levantar el Stack

```bash
docker compose up -d --build
```

Esto compilará la imagen de los mocks en Node 22, compilará el JAR de `tpi-roadmap`, levantará Kafka en KRaft, PostgreSQL, Eureka, el Gateway y los 5 servicios.

Para ver los logs del Roadmap real:
```bash
docker compose logs -f roadmap
```

---

## 3. URLs del Sistema

| Servicio | URL / Puerto | Descripción |
|---|---|---|
| **API Gateway** | `http://localhost:8080` | Punto de entrada unificado para frontend y curl (`/api/**`). |
| **Panel de Control** | `http://localhost:8080/_mock/` | UI web para cambiar de sesión, cerrar desafíos y probar fallas. |
| **Eureka Registry** | `http://localhost:8761` | Registro de instancias (dashboard Steeltoe / Eureka). |
| **Consulta Registry** | `http://localhost:8080/_mock/registry` | JSON con estado de las aplicaciones registradas. |
| **Kafka Broker** | `localhost:9094` | Listener externo para depuración o clientes host. |
| **PostgreSQL** | `localhost:5433` | Base de datos de Roadmap (`roadmap` / `roadmap`). |

---

## 4. Usuarios y Credenciales Sembradas

Todos los usuarios aceptan cualquier contraseña (ej. `mock`) y cualquier código 2FA (ej. `123456`):

| Rol | Email | UUID | Notas |
|---|---|---|---|
| **Profesor** | `profesor@utn.edu.ar` | `2db91e4f-a408-4b4f-85ec-a68804984cad` | Profesor asignado a la cohorte demo. |
| **Gestor** | `gestor@utn.edu.ar` | `c0ffee00-aaaa-4bbb-8ccc-ddddeeeeffff` | Gestor asignado a la cohorte demo. |
| **Admin** | `admin@utn.edu.ar` | `00000000-0000-0000-0000-000000000001` | Administrador global del sistema. |
| **Alumnos 01..12** | `alumno01@frc.utn.edu.ar` ... `alumno12@frc.utn.edu.ar` | `30000000-0000-4000-8000-0000000000NN` | Matriculados en la cohorte demo. Alumno 01 también responde a `alumno@frc.utn.edu.ar`. |

### Cohorte y Desafíos Demo

- **Cohorte Demo:** `10000000-0000-4000-8000-000000000001` ("Programación I — Mock", código `PROG1-MOCK`).
- **Desafíos Demo 1..11:** `40000000-0000-4000-8000-000000000001` a `...0011` (publicados y listos para usar en roadmap).

---

## 5. Cómo Usarlo Desde el Frontend

Inicia la aplicación Angular apuntando el proxy al Gateway de los mocks:

```bash
npx ng serve --proxy-config ../../Backend/tpi-roadmap-mocks/front/proxy.mock.conf.json
```
*(Ajusta la ruta relativa al archivo según la estructura de carpetas de tu equipo).*

El proxy redirige todas las llamadas `/api/**` a `http://localhost:8080`. Puedes abrir `http://localhost:8080/_mock/` en el navegador para hacer clic en "Entrar como" y cambiar de usuario inmediatamente sin tener que pasar por el formulario de login.

---

## 6. Modo IDE (Desarrollo y Debug de Roadmap)

Si deseas depurar `tpi-roadmap` localmente desde IntelliJ IDEA, VS Code o terminal:

1. Levanta la infraestructura y los mocks excluyendo el contenedor de roadmap:
```bash
docker compose up -d --scale roadmap=0
```

2. Ejecuta tu aplicación `tpi-roadmap`:
- Desde el IDE, configurando la variable de entorno o perfil activo:
```env
SPRING_PROFILES_ACTIVE=dev,mock
```
- O desde la terminal en `tpi-roadmap`:
  - **PowerShell (Windows):**
    ```powershell
    $env:JAVA_HOME = "C:\Program Files\OpenJDK\jdk-21"
    .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev,mock" "-DskipTests"
    ```
  - **Bash (Linux/macOS):**
    ```bash
    ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev,mock -DskipTests
    ```
*(Requiere el perfil mock de `tpi-roadmap`, incorporado por la tarea T3.6 en `src/main/resources/application-mock.properties`, el cual conecta Roadmap a Postgres en `:5433` y a Kafka en `:9094`).*

El Gateway incluye `host.docker.internal:host-gateway`, por lo que enrutará automáticamente el tráfico al Roadmap que corre en tu IDE o terminal local.

---

## 7. Ejecución del Smoke Test

El smoke test ejecuta de punta a punta el escenario de aceptación completo (§6): autenticación, creación de cohorte y desafíos, definición de secciones/nodos y reglas en Roadmap, matrícula de alumno y verificación de desbloqueos progresivos asíncronos vía Kafka.

```bash
bash scripts/smoke.sh
```

El script finaliza con `exit 0` y salida legible si todos los pasos pasan exitosamente.

---

## 8. Flujos HTTP Manuales

El archivo [`flujos.http`](flujos.http) contiene colecciones organizadas listas para ejecutar con **IntelliJ HTTP Client** o la extensión **REST Client** de VS Code:
- Autenticación completa y ciclo de vida de tokens.
- Diagnóstico del panel y Eureka.
- Escenarios A (desbloqueo secuencial), B (reglas OR), C (semilla demo) y D (idempotencia de eventos Kafka).
- Inyección y limpieza de fallas controladas (503 / latencia).

---

## 9. Cómo Resetear el Entorno

Para limpiar todo el estado en memoria de los mocks y reiniciar la base de datos de Roadmap desde cero:

```bash
docker compose down -v
docker compose up -d --build
```

> **Nota sobre perfiles y matrículas sembradas:**
> La variable `PUBLISH_SEED_ENROLLMENTS` (por defecto `false` en `courses`) evita que el mock de cursos republique eventos `STUDENT_ENROLLED` para los 12 alumnos de la semilla demo al arrancar, ya que con `ROADMAP_PROFILES=dev,demo` (default) Roadmap siembra esas mismas filas internamente a través de `DemoDataSeeder`. Solo debe configurarse en `true` si se ejecuta Roadmap sin el perfil `demo`. Cualquier cambio en los perfiles activos requiere resetear el entorno con `docker compose down -v`.

---

## 10. Cómo Extender el Stack (Sumar el Mock de Otro Grupo)

Para incorporar o actualizar el mock de otro microservicio (ej. accounting):

1. **Documentar el contrato:** Crear `docs/contratos/<micro>.md` con las rutas, shapes, status y eventos exactos, citando el repositorio del grupo (`archivo:línea` y commit de referencia).
2. **Implementar el mock:** Crear `mocks/services/<micro>.mjs` usando los módulos reutilizables `lib/http.mjs` y `lib/kafka.mjs`. Debe registrarse en Eureka como `<segmento>-service`.
3. **Declararlo en Compose:** Agregar el servicio en `docker-compose.yml` usando la misma imagen (`build: ./mocks`) y especificando `command: ["node", "services/<micro>.mjs"]`. **El Gateway no requiere cambios:** descubre y enruta dinámicamente según Eureka.
4. **Habilitar modo HTTP en Roadmap:** Si Roadmap poseía un cliente en modo `stub` para ese servicio, conmutarlo a `http` mediante la variable de entorno correspondiente en `docker-compose.yml`.
5. **Sumar casos de prueba:** Añadir las peticiones del nuevo servicio en `flujos.http` y en `scripts/smoke.sh`.
