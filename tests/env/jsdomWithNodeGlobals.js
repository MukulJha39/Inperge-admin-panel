/* eslint-env node */
/**
 * jsdom test environment plus the web globals Node already implements.
 *
 * jest-environment-jsdom builds a context without fetch, streams or encoders, so a
 * component that talks to the real API cannot run in it. Rather than shipping a stack
 * of polyfills, this copies Node's own implementations into the jsdom context, which
 * keeps the integration suite behaving like a browser without extra dependencies.
 */
const JSDOMEnvironment = require('jest-environment-jsdom').default;

const NODE_GLOBALS = [
  'fetch',
  'Headers',
  'Request',
  'Response',
  'FormData',
  'Blob',
  'File',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'ByteLengthQueuingStrategy',
  'CountQueuingStrategy',
  'TextEncoder',
  'TextDecoder',
  'TextEncoderStream',
  'TextDecoderStream',
  'CompressionStream',
  'DecompressionStream',
  'AbortController',
  'AbortSignal',
  'MessageChannel',
  'MessagePort',
  'BroadcastChannel',
  'structuredClone',
  'crypto',
  'queueMicrotask',
];

class JsdomWithNodeGlobals extends JSDOMEnvironment {
  constructor(config, context) {
    super(config, context);

    for (const name of NODE_GLOBALS) {
      // Never override something jsdom already provides.
      if (this.global[name] === undefined && globalThis[name] !== undefined) {
        this.global[name] = globalThis[name];
      }
    }
  }
}

module.exports = JsdomWithNodeGlobals;
