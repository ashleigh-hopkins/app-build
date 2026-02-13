/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  verbose: true,
  moduleNameMapper: {
    '^@actions/core$': '<rootDir>/__mocks__/@actions/core.ts',
    '^@actions/exec$': '<rootDir>/__mocks__/@actions/exec.ts',
    '^@actions/glob$': '<rootDir>/__mocks__/@actions/glob.ts',
    '^@actions/artifact$': '<rootDir>/__mocks__/@actions/artifact.ts',
    '^@actions/cache$': '<rootDir>/__mocks__/@actions/cache.ts',
  },
};
