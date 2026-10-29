import '@testing-library/jest-dom';

// The bundler injects this at build time; tests provide it directly.
process.env.REACT_APP_API_URL = 'http://localhost:4100/api/v1';
