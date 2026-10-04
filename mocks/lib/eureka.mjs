export async function register(appName, port, hostName = process.env.HOSTNAME || 'localhost') {
  const appUpper = appName.toUpperCase();
  const instanceId = `${hostName}:${port}`;
  let eurekaBase = (process.env.EUREKA_URL || 'http://eureka:8761/eureka').replace(/\/+$/, '');
  if (!eurekaBase.endsWith('/eureka')) {
    eurekaBase = `${eurekaBase}/eureka`;
  }

  const registrationBody = {
    instance: {
      instanceId,
      hostName,
      app: appUpper,
      ipAddr: hostName,
      vipAddress: appUpper,
      secureVipAddress: appUpper,
      status: 'UP',
      port: {
        $: Number(port),
        '@enabled': 'true'
      },
      securePort: {
        $: 443,
        '@enabled': 'false'
      },
      healthCheckUrl: `http://${hostName}:${port}/actuator/health`,
      statusPageUrl: `http://${hostName}:${port}/actuator/info`,
      homePageUrl: `http://${hostName}:${port}/`,
      dataCenterInfo: {
        '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
        name: 'MyOwn'
      }
    }
  };

  let registered = false;
  let heartbeatInterval = null;

  async function sendRegistration() {
    try {
      const res = await fetch(`${eurekaBase}/apps/${appUpper}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(registrationBody)
      });
      if (res.ok || res.status === 204) {
        console.log(`[eureka] Registered ${appUpper} (${instanceId}) in Eureka`);
        registered = true;
        startHeartbeat();
        return true;
      } else {
        console.warn(`[eureka] Registration of ${appUpper} failed with status ${res.status}`);
        return false;
      }
    } catch (err) {
      console.warn(`[eureka] Cannot connect to Eureka at ${eurekaBase}: ${err.message}`);
      return false;
    }
  }

  async function sendHeartbeat() {
    try {
      const res = await fetch(`${eurekaBase}/apps/${appUpper}/${encodeURIComponent(instanceId)}`, {
        method: 'PUT',
        headers: {
          'Accept': 'application/json'
        }
      });
      if (res.status === 404) {
        console.warn(`[eureka] Heartbeat got 404 for ${appUpper} (${instanceId}), re-registering...`);
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        registered = false;
        await registerLoop();
      } else if (!res.ok && res.status !== 204) {
        console.warn(`[eureka] Heartbeat returned status ${res.status}`);
      }
    } catch (err) {
      console.warn(`[eureka] Heartbeat failed: ${err.message}`);
    }
  }

  function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(sendHeartbeat, 30000);
  }

  async function registerLoop() {
    while (!registered) {
      const success = await sendRegistration();
      if (success) break;
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  async function deregister() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    try {
      await fetch(`${eurekaBase}/apps/${appUpper}/${encodeURIComponent(instanceId)}`, {
        method: 'DELETE'
      });
      console.log(`[eureka] Deregistered ${appUpper} (${instanceId})`);
    } catch (err) {
      console.warn(`[eureka] Failed to deregister: ${err.message}`);
    }
  }

  process.once('SIGTERM', async () => {
    console.log(`[eureka] Received SIGTERM, deregistering ${appUpper}...`);
    await deregister();
    process.exit(0);
  });

  process.once('SIGINT', async () => {
    console.log(`[eureka] Received SIGINT, deregistering ${appUpper}...`);
    await deregister();
    process.exit(0);
  });

  // Iniciar registro
  await registerLoop();

  return { deregister };
}
