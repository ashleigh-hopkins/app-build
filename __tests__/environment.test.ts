import * as core from '@actions/core';
import { applyEnvironmentVariables } from '../src/index';

// ---------------------------------------------------------------------------
// applyEnvironmentVariables
// ---------------------------------------------------------------------------

describe('applyEnvironmentVariables', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore process.env to its original state after each test
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  // --- Valid inputs ---

  it('sets environment variables from a valid JSON object', () => {
    const input = JSON.stringify({ APP_ENV: 'production', API_URL: 'https://api.example.com' });
    const result = applyEnvironmentVariables(input);

    expect(process.env.APP_ENV).toBe('production');
    expect(process.env.API_URL).toBe('https://api.example.com');
    expect(result).toEqual({ APP_ENV: 'production', API_URL: 'https://api.example.com' });
  });

  it('logs the keys that were set (not values)', () => {
    const input = JSON.stringify({ SECRET_KEY: 'super-secret', APP_ENV: 'staging' });
    applyEnvironmentVariables(input);

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('SECRET_KEY'),
    );
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('APP_ENV'),
    );
    // Ensure values are NOT logged
    const calls = (core.info as jest.Mock).mock.calls.map((c: unknown[]) => c[0]);
    for (const msg of calls) {
      expect(msg).not.toContain('super-secret');
      expect(msg).not.toContain('staging');
    }
  });

  it('sets a single environment variable', () => {
    const input = JSON.stringify({ APP_ENV: 'development' });
    const result = applyEnvironmentVariables(input);

    expect(process.env.APP_ENV).toBe('development');
    expect(result).toEqual({ APP_ENV: 'development' });
  });

  it('handles many variables', () => {
    const vars: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      vars[`VAR_${i}`] = `value_${i}`;
    }
    const result = applyEnvironmentVariables(JSON.stringify(vars));

    for (let i = 0; i < 20; i++) {
      expect(process.env[`VAR_${i}`]).toBe(`value_${i}`);
    }
    expect(Object.keys(result)).toHaveLength(20);
  });

  it('variables are available on process.env for child processes', () => {
    applyEnvironmentVariables(JSON.stringify({ CHILD_PROC_VAR: 'inherited' }));

    // process.env is what child_process.spawn/exec inherits
    expect(process.env.CHILD_PROC_VAR).toBe('inherited');
  });

  // --- Empty / missing input ---

  it('returns empty object and does nothing for empty string', () => {
    const result = applyEnvironmentVariables('');

    expect(result).toEqual({});
    expect(core.info).not.toHaveBeenCalled();
  });

  it('returns empty object for an empty JSON object', () => {
    const result = applyEnvironmentVariables('{}');

    expect(result).toEqual({});
    expect(core.info).not.toHaveBeenCalled();
  });

  // --- Invalid inputs ---

  it('throws for invalid JSON', () => {
    expect(() => applyEnvironmentVariables('not json')).toThrow(
      /Invalid JSON in "environment" input/,
    );
  });

  it('throws for a JSON array', () => {
    expect(() => applyEnvironmentVariables('["a", "b"]')).toThrow(
      /must be a JSON object/,
    );
  });

  it('throws for a JSON string', () => {
    expect(() => applyEnvironmentVariables('"just a string"')).toThrow(
      /must be a JSON object/,
    );
  });

  it('throws for a JSON number', () => {
    expect(() => applyEnvironmentVariables('42')).toThrow(
      /must be a JSON object/,
    );
  });

  it('throws for null JSON', () => {
    expect(() => applyEnvironmentVariables('null')).toThrow(
      /must be a JSON object/,
    );
  });

  it('throws when a value is not a string', () => {
    const input = JSON.stringify({ APP_ENV: 'production', DEBUG: true });
    expect(() => applyEnvironmentVariables(input)).toThrow(
      /Environment variable "DEBUG" must be a string value/,
    );
  });

  it('throws when a value is a number', () => {
    const input = JSON.stringify({ PORT: 3000 });
    expect(() => applyEnvironmentVariables(input)).toThrow(
      /Environment variable "PORT" must be a string value/,
    );
  });

  it('throws when a value is an object', () => {
    const input = JSON.stringify({ NESTED: { foo: 'bar' } });
    expect(() => applyEnvironmentVariables(input)).toThrow(
      /Environment variable "NESTED" must be a string value/,
    );
  });

  it('includes the raw input in the error message for invalid JSON', () => {
    const badInput = '{broken json!!}';
    expect(() => applyEnvironmentVariables(badInput)).toThrow(badInput);
  });
});
