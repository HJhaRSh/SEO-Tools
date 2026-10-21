import http from 'http';
import net from 'net';
import dns from 'dns';
import type { Duplex } from 'stream';
import { promisify } from 'util';
import { isBlockedHostname, isPrivateOrReservedIP } from './ssrf';

const dnsLookup = promisify(dns.lookup);
const ALLOWED_PORTS = new Set(['80', '443', '']);

export interface SsrfGuardProxyInstance {
  port: number;
  proxyUrl: string;
  close: () => Promise<void>;
}

export interface StartSecureProxyOptions {
  allowLocalhostForTesting?: boolean;
  lookupFn?: (hostname: string) => Promise<{ address: string; family: number }[]>;
}

/**
 * Validates a destination hostname and verifies all resolved IP addresses are public.
 * Throws an error if any resolved IP is private, link-local, loopback, metadata, or reserved.
 * Resolves DNS at connection authorization time without long-lived positive caching,
 * ensuring the returned IP is pre-validated for the actual TCP connection.
 */
export async function validateDestination(
  hostname: string,
  portStr?: string,
  allowLocalhostForTesting = false,
  lookupFn?: (hostname: string) => Promise<{ address: string; family: number }[]>
): Promise<string> {
  const cleanHost = hostname.toLowerCase().trim();
  const unbracketedHost = cleanHost.replace(/^\[|\]$/g, '');
  const port = portStr || '80';

  const isLocalhostTest =
    allowLocalhostForTesting &&
    (unbracketedHost === 'localhost' || unbracketedHost === '127.0.0.1' || unbracketedHost === '::1');

  if (!isLocalhostTest && !ALLOWED_PORTS.has(port)) {
    throw new Error(`SSRF Guard: Port ${port} is not permitted.`);
  }

  if (isLocalhostTest) {
    return unbracketedHost === '::1' ? '::1' : '127.0.0.1';
  }

  // Check if hostname is already a raw IP
  if (net.isIP(unbracketedHost)) {
    if (isPrivateOrReservedIP(unbracketedHost)) {
      throw new Error(`SSRF Guard: IP address ${unbracketedHost} is private or reserved.`);
    }
    return unbracketedHost;
  }

  if (isBlockedHostname(unbracketedHost)) {
    throw new Error(`SSRF Guard: Hostname ${unbracketedHost} is blocked.`);
  }

  // Resolve DNS records dynamically for the connection (no long-lived authorization cache)
  const resolver = lookupFn || ((host: string) => dnsLookup(host, { all: true }));
  let addresses: { address: string; family: number }[];
  try {
    addresses = await resolver(unbracketedHost);
  } catch (dnsErr: unknown) {
    const msg = dnsErr instanceof Error ? dnsErr.message : String(dnsErr);
    throw new Error(`SSRF Guard: DNS resolution failed for ${unbracketedHost}: ${msg}`);
  }

  if (!addresses || addresses.length === 0) {
    throw new Error(`SSRF Guard: DNS resolution returned no addresses for ${unbracketedHost}.`);
  }

  for (const record of addresses) {
    if (isPrivateOrReservedIP(record.address)) {
      throw new Error(`SSRF Guard: Host ${unbracketedHost} resolves to private/reserved IP ${record.address}.`);
    }
  }

  // Return the first validated public IP
  return addresses[0].address;
}

/**
 * Creates an in-process, validating forward proxy that enforces strict outbound SSRF rules.
 * All traffic routed through this proxy (main frame, subresources, WebSockets, workers)
 * is validated and connects directly to the pre-validated public IP address, preventing
 * DNS rebinding / TOCTOU SSRF attacks between DNS validation and Chromium connection.
 */
export async function startSsrfGuardProxy(
  options?: StartSecureProxyOptions
): Promise<SsrfGuardProxyInstance> {
  // Effective allowLocalhost: requires both the option AND a non-production environment
  const allowLocalhost =
    (options?.allowLocalhostForTesting ?? false) && process.env.NODE_ENV !== 'production';

  const activeSockets = new Set<net.Socket | Duplex>();

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

      const validatedIp = await validateDestination(
        parsed.hostname,
        parsed.port,
        allowLocalhost,
        options?.lookupFn
      );

      const port = parsed.port ? parseInt(parsed.port, 10) : 80;
      const proxyReq = http.request(
        {
          host: validatedIp,
          port,
          method: req.method,
          path: parsed.pathname + parsed.search,
          headers: {
            ...req.headers,
            host: parsed.hostname + (parsed.port ? `:${parsed.port}` : ''),
          },
          timeout: 15000,
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
    } catch (err: unknown) {
      if (!res.headersSent) {
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end(`SSRF Blocked: ${msg}`);
      }
    }
  });

  server.on('connection', (sock) => {
    activeSockets.add(sock);
    sock.once('close', () => activeSockets.delete(sock));
  });

  // Handle HTTPS CONNECT tunneling (used by Chromium for https:// requests)
  server.on('connect', async (req, clientSocket, head) => {
    activeSockets.add(clientSocket);
    clientSocket.once('close', () => activeSockets.delete(clientSocket));

    try {
      const authority = req.url || '';
      let hostname: string;
      let portNum: number;

      if (authority.startsWith('[')) {
        // Bracketed IPv6: [2001:db8::1]:443
        const closingBracket = authority.indexOf(']');
        if (closingBracket === -1) {
          clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          clientSocket.destroy();
          return;
        }
        hostname = authority.slice(1, closingBracket);
        const afterBracket = authority.slice(closingBracket + 1);
        portNum = afterBracket.startsWith(':') ? parseInt(afterBracket.slice(1), 10) : 443;
      } else {
        // Normal hostname or IPv4 or unbracketed IPv6
        const lastColon = authority.lastIndexOf(':');
        if (lastColon === -1) {
          hostname = authority;
          portNum = 443;
        } else {
          hostname = authority.slice(0, lastColon);
          portNum = parseInt(authority.slice(lastColon + 1), 10);
        }
      }

      if (!hostname) {
        clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        clientSocket.destroy();
        return;
      }

      if (isNaN(portNum) || portNum <= 0) portNum = 443;

      const validatedIp = await validateDestination(
        hostname,
        String(portNum),
        allowLocalhost,
        options?.lookupFn
      );

      // Connect directly to the pre-validated public IP address
      const targetSocket = net.connect(portNum, validatedIp, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length > 0) {
          targetSocket.write(head);
        }
        targetSocket.pipe(clientSocket);
        clientSocket.pipe(targetSocket);
      });

      activeSockets.add(targetSocket);
      targetSocket.once('close', () => activeSockets.delete(targetSocket));

      targetSocket.on('error', () => {
        clientSocket.destroy();
      });

      clientSocket.on('error', () => {
        targetSocket.destroy();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      clientSocket.write(
        `HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nSSRF Blocked: ${msg}\r\n`
      );
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
        for (const sock of activeSockets) {
          sock.destroy();
        }
        server.close(() => resolve());
      }),
  };
}
