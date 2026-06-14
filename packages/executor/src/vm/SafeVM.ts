import { VM } from 'vm2';

interface SafeVMOptions {
  timeout?: number; // milliseconds, default 1000
}

/**
 * SafeVM wraps VM2's VM to provide a sandboxed execution environment
 * for compiled formulas and script blocks.
 *
 * Security features:
 * - No require() access (sandbox:true disables Node module loading)
 * - Timeout enforcement prevents infinite loops
 * - No file system or network access
 * - Isolated global scope (no pollution of host context)
 *
 * Usage:
 * ```ts
 * const vm = new SafeVM({ timeout: 1000 });
 * const result = vm.execute('ctx.a + ctx.b', { ctx: { a: 1, b: 2 } });
 * ```
 */
export class SafeVM {
  private timeout: number;

  constructor(options: SafeVMOptions = {}) {
    this.timeout = options.timeout ?? 1000;
  }

  execute(code: string, context?: Record<string, unknown>): unknown {
    const vm = new VM({
      timeout: this.timeout,
      sandbox: context ?? {},
    });

    // Wrap in an IIFE so return value is captured
    const wrappedCode = `(function() { return (${code}); })()`;
    return vm.run(wrappedCode);
  }
}
