const nextJest = require('next/jest');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');

// next/jest loads next.config.js and .env files and configures the SWC transform
const createJestConfig = nextJest({ dir: projectRoot });

const customJestConfig = {
  rootDir: projectRoot,
  // Component tests need a DOM; API/util tests opt into Node with a `@jest-environment node` docblock
  testEnvironment: 'jest-environment-jsdom',
  testMatch: ['<rootDir>/__tests__/**/*.test.(js|jsx|ts|tsx)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/config/jest/jest.setup.js'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/e2e/'],
  // Coverage only when asked for (`pnpm test:coverage`)
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
  ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
