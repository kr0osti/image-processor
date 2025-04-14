const nextJest = require('next/jest');
const path = require('path');

// Get the absolute path to the project root
const projectRoot = path.resolve(__dirname, '../..');
console.log('Project root:', projectRoot);

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: projectRoot,
});

// Add any custom config to be passed to Jest
// Log the current directory for debugging
console.log('Current directory:', process.cwd());

const customJestConfig = {
  // Disable setupFilesAfterEnv for now to avoid path issues
  // setupFilesAfterEnv: [
  //   process.env.NODE_ENV === 'test-node'
  //     ? './__tests__/api/setup.js'
  //     : './config/jest/jest.setup.js',
  // ],
  rootDir: projectRoot,
  testEnvironment: 'jest-environment-jsdom',
  forceExit: true,
  testMatch: [
    '**/__tests__/**/*.test.(js|jsx|ts|tsx)',
    '**/?(*.)+(spec|test).(js|jsx|ts|tsx)',
  ],
  moduleNameMapper: {
    // Handle module aliases (if you have them in tsconfig.json)
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Add more setup options before each test is run
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/e2e/'],
  transform: {
    // Use babel-jest to transpile tests with the next/babel preset
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  collectCoverage: true,
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
  ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
