/**
 * Browser-safe sync API.
 *
 * Keep this entry point free of Node built-ins such as crypto, fs, path and
 * Buffer-backed filesystem adapters. Browser applications must import from
 * this module rather than the Node-capable package barrel.
 */
export * from "./detectSyncConflict.js";
export * from "./primitives/index.js";
export * from "./entityRepository/index.js";
