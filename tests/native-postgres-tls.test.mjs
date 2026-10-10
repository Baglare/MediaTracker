import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, connect } from 'node:tls';
import { once } from 'node:events';
import { postgresTls } from '../lib/backend/postgres-tls.mjs';

test('real loopback TLS handshake requires trusted private CA and exact DNS/IP SAN',async()=>{
  const root=mkdtempSync(join(tmpdir(),'mt-p4-tls-'));
  const openssl=process.platform==='win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe')
    ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
  const run=args=>execFileSync(openssl,args,{cwd:root,stdio:'ignore',windowsHide:true,timeout:10000});
  let server;
  try {
    for(const name of ['ca','other'])run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',`${name}.key`,
      '-out',`${name}.crt`,'-days','2','-subj',`/CN=MediaTracker Synthetic ${name}`,'-addext','basicConstraints=critical,CA:TRUE']);
    run(['req','-newkey','rsa:2048','-nodes','-keyout','server.key','-out','server.csr','-subj','/CN=localhost']);
    writeFileSync(join(root,'extensions'),'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n');
    run(['x509','-req','-in','server.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-out','server.crt','-days','2','-extfile','extensions']);
    server=createServer({cert:readFileSync(join(root,'server.crt')),key:readFileSync(join(root,'server.key'))},socket=>socket.end());
    server.on('tlsClientError',()=>{});
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const handshake=(ca,identity)=>new Promise((resolve,reject)=>{
      const options=postgresTls(true,join(root,ca),identity);
      assert.equal(options.rejectUnauthorized,true);
      const socket=connect({host:'127.0.0.1',port:server.address().port,...options},()=>{socket.end();resolve(socket.authorized);});
      socket.setTimeout(3000,()=>socket.destroy(new Error('tls_test_timeout')));
      socket.once('error',reject);
    });
    assert.equal(await handshake('ca.crt','127.0.0.1'),true);
    assert.equal(await handshake('ca.crt','localhost'),true);
    assert.equal(await handshake('ca.crt','[::1]'),true);
    await assert.rejects(handshake('ca.crt','wrong.example.invalid'),/Hostname\/IP does not match/);
    await assert.rejects(handshake('other.crt','127.0.0.1'));
    writeFileSync(join(root,'invalid.crt'),'not a certificate');
    for(const path of ['missing.crt','invalid.crt','server.key','server.crt'])
      assert.throws(()=>postgresTls(true,join(root,path),'127.0.0.1'),/^Error: native_tls_configuration_invalid$/);
    assert.throws(()=>postgresTls(true,'relative.crt','127.0.0.1'));
    assert.throws(()=>postgresTls(false,join(root,'ca.crt'),'127.0.0.1'));
    assert.equal(postgresTls(false,undefined,'127.0.0.1'),false);
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    rmSync(root,{recursive:true,force:true});
  }
});
