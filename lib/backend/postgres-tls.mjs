import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { X509Certificate } from 'node:crypto';
import { checkServerIdentity } from 'node:tls';
import { isIP } from 'node:net';

export function postgresHostname(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']') && isIP(hostname.slice(1,-1))===6
    ? hostname.slice(1,-1) : hostname;
}

export function postgresTls(enabled, caPath, hostname) {
  if (!enabled) {
    if (caPath) throw new Error('native_tls_configuration_invalid');
    return false;
  }
  try {
    let ca;
    if (caPath) {
      if (!isAbsolute(caPath)) throw new Error();
      const stat = lstatSync(caPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 65536) throw new Error();
      ca = readFileSync(caPath, 'utf8');
      // A dedicated PEM CA bundle, never a private key or arbitrary TLS options.
      const blocks = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
      if (!blocks?.length || blocks.join('').replace(/\s/g,'') !== ca.replace(/\s/g,'')) throw new Error();
      for (const pem of blocks) {
        const cert = new X509Certificate(pem);
        if (!cert.ca || Date.parse(cert.validTo) <= Date.now() || Date.parse(cert.validFrom) > Date.now()) throw new Error();
      }
    }
    return { rejectUnauthorized: true, ...(ca ? { ca } : {}),
      checkServerIdentity: (_servername, cert) => checkServerIdentity(postgresHostname(hostname), cert) };
  } catch { throw new Error('native_tls_configuration_invalid'); }
}
