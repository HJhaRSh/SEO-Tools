import { isIP } from 'net';

/**
 * Checks if an IPv4 or IPv6 address is in a private, loopback, link-local, multicast, or cloud metadata range.
 */
export function isPrivateOrReservedIP(ip: string): boolean {
  // Check IPv4
  if (ip.includes('.')) {
    const parts = ip.split('.').map(p => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
      return true; // Malformed IPv4
    }

    const [a, b, c, d] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private)
    if (a === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local, AWS/GCP/Azure link-local metadata 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && c === 2) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reserved / Future use & Broadcast)
    if (a >= 240) return true;

    return false;
  }

  // Check IPv6
  if (ip.includes(':')) {
    const normalized = ip.toLowerCase();
    // ::1 (Loopback)
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
    // :: (Unspecified)
    if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;
    // IPv4-mapped IPv6 (::ffff:127.0.0.1)
    if (normalized.startsWith('::ffff:')) {
      const v4Part = normalized.replace('::ffff:', '');
      return isPrivateOrReservedIP(v4Part);
    }
    // Unique local address fc00::/7 (fc00... or fd00...)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    // Link-local address fe80::/10
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
    // Multicast ff00::/8
    if (normalized.startsWith('ff')) return true;

    return false;
  }

  return true;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'broadcasthost',
  'metadata.google.internal',
  'instance-data',
]);

/**
 * Validates a hostname to ensure it does not refer to internal names or IP patterns.
 */
export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();

  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith('.local') || lower.endsWith('.internal') || lower.endsWith('.localhost') || lower.endsWith('.corp')) {
    return true;
  }

  // If the hostname is already an IP, check it
  if (isIP(lower)) {
    return isPrivateOrReservedIP(lower);
  }

  return false;
}
