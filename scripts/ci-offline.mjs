// Applied only to CI validation subprocesses, never to the application runtime.
// Node workers inherit NODE_OPTIONS. IPC pipes and literal loopback TCP remain
// usable for Turbopack's PostCSS worker; external TCP and all UDP are denied.
import net from "node:net";
import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";
const connect = net.Socket.prototype.connect;

net.Socket.prototype.connect = function (...args) {
  // net.connect also accepts its internally normalized [options, callback] tuple.
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (options && typeof options === "object" && typeof options.path === "string" && !options.port) {
    return connect.apply(this, args);
  }
  if (typeof options === "string" && !/^\d+$/.test(options)) {
    return connect.apply(this, args);
  }
  const host = typeof options === "object" ? options.host : args[1];
  if (host === "127.0.0.1" || host === "::1") return connect.apply(this, args);
  throw new Error("CI_OFFLINE_NETWORK_DENIED");
};
dgram.Socket.prototype.send = function () {
  throw new Error("CI_OFFLINE_NETWORK_DENIED");
};
syncBuiltinESMExports();
