import { describe, it, expect } from 'vitest';
import { SafeVM } from '../src/vm/SafeVM';

describe('SafeVM', () => {
  it('executes simple arithmetic expression', () => {
    const vm = new SafeVM();
    const result = vm.execute('3 + 4 * 2');
    expect(result).toBe(11);
  });

  it('provides context with primitive values', () => {
    const vm = new SafeVM();
    const result = vm.execute('a + b', { a: 10, b: 20 });
    expect(result).toBe(30);
  });

  it('provides context with functions', () => {
    const vm = new SafeVM();
    const result = vm.execute('add(10, 20)', {
      add: (x: number, y: number) => x + y,
    });
    expect(result).toBe(30);
  });

  it('throws on infinite loop timeout', () => {
    const vm = new SafeVM({ timeout: 200 });
    // Use function(){} so while is valid in expression position
    const code = '(function(){ while(true){} })()';
    expect(() => {
      vm.execute(code);
    }).toThrow(/Script execution timed out/i);
  });

  it('blocks require', () => {
    const vm = new SafeVM();
    expect(() => {
      vm.execute('require("fs")');
    }).toThrow();
  });

  it('handles null and undefined returns', () => {
    const vm = new SafeVM();
    expect(vm.execute('null')).toBe(null);
    expect(vm.execute('undefined')).toBe(undefined);
  });

  it('handles boolean and string', () => {
    const vm = new SafeVM();
    expect(vm.execute('true')).toBe(true);
    expect(vm.execute('"hello"')).toBe('hello');
  });
});
