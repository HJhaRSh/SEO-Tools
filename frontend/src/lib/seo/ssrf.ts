import { isIP } from 'net';

/**
 * Expands a compressed IPv6 address to its full 8-group form.
 * Returns null if the input is not a valid-looking IPv6 address.
 */
function expandIPv6(addr: string): string | null {
  // Remove brackets if present (e.g. [2001:db8::1])
  let a = addr.replace(/^\[|\]$/g, '');
  // Remove zone identifier (e.g. %eth0)
  const zoneIdx = a.indexOf('%');
  if (zoneIdx !== -1) a = a.slice(0, zoneIdx);

  if (!a.includes(':')) return null;

  // Handle embedded IPv4 in the last position (e.g. ::ffff:127.0.0.1)
  // Convert embedded dotted-quad to hex groups before expansion
  const lastColon = a.lastIndexOf(':');
  const maybeV4 = a.slice(lastColon + 1);
  if (maybeV4.includes('.')) {
    const v4parts = maybeV4.split('.').map(p => parseInt(p, 10));
    if (v4parts.length === 4 && v4parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
      const hi = ((v4parts[0] << 8) | v4parts[1]).toString(16).padStart(4, '0');
      const lo = ((v4parts[2] << 8) | v4parts[3]).toString(16).padStart(4, '0');
      a = a.slice(0, lastColon + 1) + hi + ':' + lo;
    }
  }

  // Expand :: shorthand
  const sides = a.split('::');
  if (sides.length > 2) return null; // Invalid: more than one ::

  if (sides.length === 2) {
    const left = sides[0] ? sides[0].split(':') : [];
    const right = sides[1] ? sides[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    const fill = Array(missing).fill('0000');
    const groups = [...left, ...fill, ...right];
    return groups.map(g => g.padStart(4, '0')).join(':');
  }

  const groups = a.split(':');
  if (groups.length !== 8) return null;
  return groups.map(g => g.padStart(4, '0')).join(':');
}

/**
 * If `addr` is an IPv4-mapped IPv6 address (::ffff:0:0/96 range), returns the
 * embedded IPv4 address as a dotted string. Otherwise returns null.
 * Handles both dotted form (::ffff:127.0.0.1) and pure-hex form (::ffff:7f00:1).
 */
function extractMappedIPv4(addr: string): string | null {
  const expanded = expandIPv6(addr);
  if (!expanded) return null;

  const groups = expanded.split(':');
  if (groups.length !== 8) return null;

  // ::ffff:0:0/96 → first 6 groups must be 0000:0000:0000:0000:0000:ffff
  const isV4Mapped =
    groups[0] === '0000' &&
    groups[1] === '0000' &&
    groups[2] === '0000' &&
    groups[3] === '0000' &&
    groups[4] === '0000' &&
    groups[5] === 'ffff';

  if (!isV4Mapped) return null;

  // Extract the 32-bit IPv4 value from groups[6] and groups[7]
  const hi = parseInt(groups[6], 16);
  const lo = parseInt(groups[7], 16);
  if (isNaN(hi) || isNaN(lo)) return null;

  const a = (hi >> 8) & 0xff;
  const b = hi & 0xff;
  const c = (lo >> 8) & 0xff;
  const d = lo & 0xff;
  return `${a}.${b}.${c}.${d}`;
}

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

    const [a, b, c] = parts;

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
    // IPv4-mapped IPv6 — both dotted form (::ffff:127.0.0.1) and hex form (::ffff:7f00:1)
    const mappedV4 = extractMappedIPv4(normalized);
    if (mappedV4 !== null) {
      return isPrivateOrReservedIP(mappedV4);
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
  if (
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.corp') ||
    lower.endsWith('.intranet') ||
    lower.endsWith('.lan')
  ) {
    return true;
  }

  // If the hostname is already an IP (with or without IPv6 brackets), check it
  const unbracketed = lower.replace(/^\[|\]$/g, '');
  if (isIP(unbracketed)) {
    return isPrivateOrReservedIP(unbracketed);
  }

  return false;
}
