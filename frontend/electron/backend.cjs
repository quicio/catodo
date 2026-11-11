const http = require("http");
const https = require("https");
const net = require("net");

function backendCandidates({ env = process.env, packaged = false } = {}) {
  const host = env.CATODO_HOST || "127.0.0.1";
  const override = env.CATODO_BACKEND_URL || null;
  if (override) {
    return [override.replace(/\/+$/, "")];
  }
  const port = env.CATODO_PORT || null;
  if (port) {
    return [`https://${host}:${port}`, `http://${host}:${port}`];
  }
  const ports = packaged ? ["8767", "8765"] : ["8765"];
  const candidates = [];
  for (const candidatePort of ports) {
    candidates.push(`https://${host}:${candidatePort}`);
    candidates.push(`http://${host}:${candidatePort}`);
  }
  return candidates;
}

function probeHealth(base, timeoutMs = 1200) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL("/api/health", base);
    } catch {
      resolve(false);
      return;
    }
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.get(
      url,
      { rejectUnauthorized: false, timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function resolveBackend(options = {}) {
  for (const base of backendCandidates(options)) {
    if (await probeHealth(base)) {
      return { url: base, useHttps: base.startsWith("https:") };
    }
  }
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(base, timeoutMs = 20000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeHealth(base, 800)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

module.exports = { backendCandidates, probeHealth, resolveBackend, freePort, waitForHealth };
