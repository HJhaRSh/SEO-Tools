import http from 'http';
import net from 'net';
import dns from 'dns';
import { promisify } from 'util';
import { isBlockedHostname, isPrivateOrReservedIP } from './ssrf.js';

const dnsLookup = promisify(dns.lookup);
const ALLOWED_PORTS = new Set(['80', '443', '']);

export interface SsrfGuardProxyInstance {
  port: number;
  proxyUrl: string;
  close: () => Promise<void>;
}

/**
 * Validates a destination hostname and verifies all resolved IP addresses are public.
 * Throws an error if any resolved IP is private, link-local, loopback, or metadata.
 */
async function validateDestination(hostname: string, portStr?: string, allowLocalhostForTesting = false): Promise<string> {
  const cleanHost = hostname.toLowerCase().trim();
  const port = portStr || '80';

  const isLocalhostTest = allowLocalhostForTesting && (cleanHost === 'localhost' || cleanHost === '127.0.0.1');

  if (!isLocalhostTest && !ALLOWED_PORTS.has(port)) {
    throw new Error(`SSRF Guard: Port ${port} is not permitted.`);
  }

  if (isLocalhostTest) {
    return '127.0.0.1';
  }

  if (isBlockedHostname(cleanHost)) {
    throw new Error(`SSRF Guard: Hostname ${cleanHost} is blocked.`);
  }

  // Check if hostname is already a raw IP
  if (net.isIP(cleanHost)) {
    if (isPrivateOrReservedIP(cleanHost)) {
      throw new Error(`SSRF Guard: IP address ${cleanHost} is private or reserved.`);
    }
    return cleanHost;
  }

  // Resolve DNS records
  const addresses = await dnsLookup(cleanHost, { all: true });
  if (!addresses || addresses.length === 0) {
    throw new Error(`SSRF Guard: DNS resolution failed for ${cleanHost}.`);
  }

  for (const record of addresses) {
    if (isPrivateOrReservedIP(record.address)) {
      throw new Error(`SSRF Guard: Host ${cleanHost} resolves to private/reserved IP ${record.address}.`);
    }
  }

  // Return the first validated public IP
  return addresses[0].address;
}

/**
 * Creates an in-process, validating forward proxy that enforces strict outbound SSRF rules.
 * All traffic routed through this proxy (including main frames, subresources, WebSockets,
 * and workers) is validated before TCP connection establishment.
 */
export async function startSsrfGuardProxy(options?: { allowLocalhostForTesting?: boolean }): Promise<SsrfGuardProxyInstance> {
  const allowLocalhost = options?.allowLocalhostForTesting ?? false;
  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request: Missing URL');
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(req.url);
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request: Malformed URL');
        return;
      }

      if (parsed.protocol !== 'http:') {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end(`Forbidden: Protocol ${parsed.protocol} not allowed through proxy.`);
        return;
      }

      const validatedIp = await validateDestination(parsed.hostname, parsed.port, allowLocalhost);

      const port = parsed.port ? parseInt(parsed.port, 10) : 80;
      const proxyReq = http.request(
        {
          host: validatedIp,
          port,
          method: req.method,
          path: parsed.pathname + parsed.search,
          headers: {
            ...req.headers,
            host: parsed.hostname + (parsed.port ? `:${parsed.port}` : '')
          },
          timeout: 15000
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(`Proxy Gateway Error: ${err.message}`);
        }
      });

      req.pipe(proxyReq);
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end(`SSRF Blocked: ${err.message}`);
      }
    }
  });

  // Handle HTTPS CONNECT tunneling (used by Chromium for https:// requests)
  server.on('connect', async (req, clientSocket, head) => {
    try {
      const [hostname, portStr] = (req.url || '').split(':');
      if (!hostname) {
        clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        clientSocket.destroy();
        return;
      }

      const port = portStr ? parseInt(portStr, 10) : 443;
      const validatedIp = await validateDestination(hostname, String(port), allowLocalhost);

      // Connect to the pre-validated public IP address
      const targetSocket = net.connect(port, validatedIp, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length > 0) {
          targetSocket.write(head);
        }
        targetSocket.pipe(clientSocket);
        clientSocket.pipe(targetSocket);
      });

      targetSocket.on('error', () => {
        clientSocket.destroy();
      });

      clientSocket.on('error', () => {
        targetSocket.destroy();
      });
    } catch (err: any) {
      clientSocket.write(`HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nSSRF Blocked: ${err.message}\r\n`);
      clientSocket.destroy();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  const address = server.address() as net.AddressInfo;
  const port = address.port;
  const proxyUrl = `http://127.0.0.1:${port}`;

  return {
    port,
    proxyUrl,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
  };
}
