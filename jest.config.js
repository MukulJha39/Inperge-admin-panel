/* eslint-env node */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  // Plain jsdom by default. The integration suite opts into the Node-globals variant
  // via a docblock, because Node's fetch keeps a keep-alive dispatcher open.
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.tsx', '**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
  moduleNameMapper: {
    '\\.css$': 'identity-obj-proxy',
    '\\.(png|jpe?g|gif|svg|webp)$': '<rootDir>/tests/fileStub.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  // The integration suite talks to a running API, so it is opt-in via `npm run test:integration`.
  testPathIgnorePatterns: ['/node_modules/', 'tests/integration\\.'],
  clearMocks: true,
  testEnvironmentOptions: { url: 'http://localhost:3100' },
};
