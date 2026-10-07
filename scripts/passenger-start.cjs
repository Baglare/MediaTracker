// Delegate directly to the generated Next standalone server; no second HTTP server.
/* eslint-disable @typescript-eslint/no-require-imports -- Passenger CommonJS startup delegates to generated CommonJS server. */
process.env.NODE_ENV = 'production';
const manifest = require('./deployment-manifest.json');
if (process.env.BACKEND_PROVIDER !== manifest.backendProvider) throw new Error('deployment_provider_mismatch');
// Passenger must supply PORT or its Node integration must intercept listen().
// Panel-specific interception is an unproven P4 gate, never a guessed socket path.
if (process.env.PORT && !/^\d{1,5}$/.test(process.env.PORT)) throw new Error('deployment_port_invalid');
if (process.env.PORT && (Number(process.env.PORT) < 1 || Number(process.env.PORT) > 65535)) throw new Error('deployment_port_invalid');
process.env.HOSTNAME = '0.0.0.0';
require('./server.js');
