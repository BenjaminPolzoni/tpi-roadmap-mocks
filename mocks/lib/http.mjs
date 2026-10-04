import http from 'node:http';

const TITLES = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable'
};

export function json(res, status = 200, body = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function problem(res, status = 500, type = 'about:blank', detail = '') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
  res.end(JSON.stringify({
    type,
    title: TITLES[status] || 'Error',
    status,
    detail
  }));
}

export function noContent(res) {
  res.statusCode = 204;
  res.end();
}

export async function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw.trim()) {
        return resolve({});
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

export function cookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const name = parts[0]?.trim();
      const value = parts.slice(1).join('=').trim();
      if (name) {
        list[name] = decodeURIComponent(value);
      }
    });
  }
  return list;
}

export function identity(req) {
  const userId = req.headers['x-user-id'];
  if (!userId) return null;
  const rolesHeader = req.headers['x-user-roles'] || '';
  const roles = rolesHeader.split(',').map(r => r.trim()).filter(Boolean);
  return { userId, roles };
}

function pathToRegex(path) {
  const keys = [];
  const pattern = path
    .replace(/\/:([a-zA-Z0-9_]+)/g, (_, key) => {
      keys.push(key);
      return '/([^/]+)';
    })
    .replace(/\//g, '\\/');
  return { regex: new RegExp(`^${pattern}\\/?$`), keys };
}

export function createApp(name) {
  const routes = [];
  let activeFault = null;

  function addRoute(method, path, handler) {
    const { regex, keys } = pathToRegex(path);
    routes.push({ method, path, regex, keys, handler });
  }

  const app = {
    get(path, handler) { addRoute('GET', path, handler); },
    post(path, handler) { addRoute('POST', path, handler); },
    put(path, handler) { addRoute('PUT', path, handler); },
    patch(path, handler) { addRoute('PATCH', path, handler); },
    delete(path, handler) { addRoute('DELETE', path, handler); },

    listen(port, callback) {
      const server = http.createServer(async (req, res) => {
        const start = Date.now();
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;

        res.on('finish', () => {
          const ms = Date.now() - start;
          console.log(`[${name}] ${req.method} ${pathname} -> ${res.statusCode} ${ms}ms`);
        });

        try {
          // Fallas inyectables: POST/DELETE /api/<seg>/mock/fault
          if (/^\/api\/[^/]+\/mock\/fault\/?$/.test(pathname)) {
            if (req.method === 'POST') {
              const body = await readJson(req).catch(() => ({}));
              activeFault = {
                status: body.status !== undefined ? Number(body.status) : null,
                delayMs: body.delayMs !== undefined ? Number(body.delayMs) : 0,
                pathPrefix: body.pathPrefix || '',
                times: body.times !== undefined ? Number(body.times) : Infinity
              };
              return json(res, 200, { ok: true, fault: activeFault });
            }
            if (req.method === 'DELETE') {
              activeFault = null;
              return json(res, 200, { ok: true, cleared: true });
            }
          }

          // Aplicar falla si está activa
          if (activeFault) {
            const matchesPrefix = !activeFault.pathPrefix || pathname.startsWith(activeFault.pathPrefix);
            if (matchesPrefix) {
              if (activeFault.times > 0) {
                activeFault.times--;
                const faultToApply = { ...activeFault };
                if (activeFault.times <= 0) {
                  activeFault = null;
                }
                if (faultToApply.delayMs > 0) {
                  await new Promise(resolve => setTimeout(resolve, faultToApply.delayMs));
                }
                if (faultToApply.status && faultToApply.status >= 400) {
                  return problem(res, faultToApply.status, 'service-unavailable', 'Falla simulada inyectada');
                }
              }
            }
          }

          // Ruteo
          let matched = null;
          const params = {};
          const query = Object.fromEntries(url.searchParams.entries());

          for (const route of routes) {
            if (route.method !== req.method) continue;
            const match = pathname.match(route.regex);
            if (match) {
              matched = route;
              route.keys.forEach((key, idx) => {
                params[key] = decodeURIComponent(match[idx + 1]);
              });
              break;
            }
          }

          if (!matched) {
            return problem(res, 404, 'not-found', `Ruta ${req.method} ${pathname} no encontrada`);
          }

          let body = {};
          if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            body = await readJson(req).catch(() => ({}));
          }

          await matched.handler(req, res, {
            params,
            query,
            body,
            identity: identity(req)
          });
        } catch (err) {
          console.error(`[${name}] Error handling ${req.method} ${pathname}:`, err);
          if (!res.headersSent) {
            problem(res, 500, 'internal-error', err.message);
          }
        }
      });

      return server.listen(port, callback);
    }
  };

  return app;
}
