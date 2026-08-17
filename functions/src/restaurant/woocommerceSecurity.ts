import dns from 'dns';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as undiciFetch, Response } from 'undici';

export interface ResolvedWooCommerceTarget {
  siteUrl: string;
  origin: string;
  hostname: string;
  resolvedIps: string[];
}

export interface WooCommerceCredentials {
  consumerKey: string;
  consumerSecret: string;
}

const FORBIDDEN_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254',
  'instance-data',
  'metadata',
]);

/**
 * Validates whether an IP address is safe (public, routable, non-internal)
 */
export function isPublicRoutableIp(ipString: string): boolean {
  try {
    let addr = ipaddr.parse(ipString);

    // If IPv4-mapped IPv6, extract the underlying IPv4 address
    if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
      addr = (addr as ipaddr.IPv6).toIPv4Address();
    }

    const range = addr.range();

    // Reject all private, loopback, linkLocal, etc.
    const forbiddenRanges = [
      'loopback',
      'private',
      'linkLocal',
      'uniqueLocal',
      'unspecified',
      'multicast',
      'reserved',
      'broadcast',
      'carrierGradeNat',
    ];

    if (forbiddenRanges.includes(range)) {
      return false;
    }

    // Explicit check for cloud metadata (169.254.169.254)
    if (addr.kind() === 'ipv4') {
      const octets = (addr as ipaddr.IPv4).octets;
      if (octets[0] === 169 && octets[1] === 254) {
        return false;
      }
      if (octets[0] === 127 || octets[0] === 10 || octets[0] === 0) {
        return false;
      }
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
        return false;
      }
      if (octets[0] === 192 && octets[1] === 168) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a WooCommerce URL against SSRF, credential leakage and DNS rebinding
 */
export async function validateWooCommerceTarget(siteUrl: string): Promise<ResolvedWooCommerceTarget> {
  if (!siteUrl || typeof siteUrl !== 'string') {
    throw new Error("L'URL du site WooCommerce est requise");
  }

  let parsed: URL;
  try {
    parsed = new URL(siteUrl);
  } catch {
    throw new Error("L'URL du site WooCommerce est invalide");
  }

  if (parsed.protocol !== 'https:') {
    throw new Error("L'URL WooCommerce doit impérativement utiliser le protocole sécurisé HTTPS (https://)");
  }

  if (parsed.username || parsed.password) {
    throw new Error("L'URL ne doit pas contenir d'identifiants intégrés (username/password)");
  }

  const hostname = parsed.hostname.toLowerCase();

  if (FORBIDDEN_HOSTNAMES.has(hostname) || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    throw new Error(`L'accès à l'hôte "${hostname}" est strictement interdit pour des raisons de sécurité`);
  }

  // Resolve all DNS records
  let lookupResults: dns.LookupAddress[] = [];
  try {
    lookupResults = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch (err: unknown) {
    throw new Error(`Échec de la résolution DNS pour "${hostname}": ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!lookupResults || lookupResults.length === 0) {
    throw new Error(`Aucune adresse IP trouvée pour le domaine "${hostname}"`);
  }

  const resolvedIps = lookupResults.map((r) => r.address);

  // Validate every resolved IP
  for (const ip of resolvedIps) {
    if (!isPublicRoutableIp(ip)) {
      throw new Error(`L'hôte "${hostname}" résout vers une adresse IP interne ou interdite (${ip})`);
    }
  }

  return {
    siteUrl: parsed.toString().replace(/\/+$/, ''),
    origin: parsed.origin,
    hostname,
    resolvedIps,
  };
}

/**
 * Executes a secure HTTP request to WooCommerce with pre-validated DNS dispatcher,
 * timeout and manual redirect loop protection.
 */
export async function requestWooCommerce(
  target: ResolvedWooCommerceTarget,
  path: string,
  credentials: WooCommerceCredentials,
  customSignal?: AbortSignal
): Promise<Response> {
  const maxRedirects = 3;
  let currentTarget = target;
  const currentPath = path.startsWith('/') ? path : `/${path}`;
  let currentUrl = `${currentTarget.origin}${currentPath}`;
  let redirectCount = 0;

  const basicAuthHeader =
    'Basic ' + Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString('base64');

  while (redirectCount <= maxRedirects) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    // Abort if parent signal aborts
    if (customSignal) {
      customSignal.addEventListener('abort', () => controller.abort());
    }

    // Create custom Undici dispatcher that pins resolved IPs to prevent DNS rebinding
    const dispatcher = new Agent({
      connect: {
        lookup: (_hostname, _options, callback) => {
          const ip = currentTarget.resolvedIps[0];
          const family = ip.includes(':') ? 6 : 4;
          callback(null, [{ address: ip, family }]);
        },
        timeout: 8000,
      },
    });

    try {
      const res = await undiciFetch(currentUrl, {
        method: 'GET',
        headers: {
          Authorization: basicAuthHeader,
          Accept: 'application/json',
          'User-Agent': 'Medjira-WooCommerce-Connector/1.0',
        },
        dispatcher,
        signal: controller.signal,
        redirect: 'manual',
      });

      clearTimeout(timeoutId);

      // Handle 3xx Redirects safely
      if ([301, 302, 307, 308].includes(res.status)) {
        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new Error('Nombre maximal de redirections HTTP dépassé (max 3)');
        }

        const location = res.headers.get('location');
        if (!location) {
          throw new Error(`Redirection HTTP ${res.status} reçue sans en-tête Location`);
        }

        const redirectUrl = new URL(location, currentUrl);
        currentTarget = await validateWooCommerceTarget(redirectUrl.toString());
        currentUrl = redirectUrl.toString();
        continue;
      }

      return res;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Délai d'attente dépassé (timeout 10s) lors de la requête vers ${currentUrl}`);
      }
      throw err;
    }
  }

  throw new Error('Boucle de redirection infinie');
}
