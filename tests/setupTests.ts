import '@testing-library/jest-dom';

// The bundler injects this at build time; tests provide it directly.
process.env.API_BASE_URL = 'http://localhost:4100/api/v1';
