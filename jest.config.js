/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((?:expo|@expo|@react-native|react-native|@react-native-async-storage|@react-navigation|react-native-.*|@react-native-community|@sentry)(?:/node_modules/.*)?))',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  clearMocks: true,
  collectCoverageFrom: [
    'types/**/*.ts',
    'services/**/*.ts',
    '!**/node_modules/**',
  ],
};
