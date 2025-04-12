// This script fixes the Jest configuration to use the correct paths for setup files
const fs = require('fs');
const path = require('path');

// Path to the Jest configuration file
const configPath = path.join(__dirname, 'config', 'jest', 'jest.config.js');

// Read the current configuration
let configContent = fs.readFileSync(configPath, 'utf8');

// Replace the setupFilesAfterEnv paths
configContent = configContent.replace(
  "process.env.NODE_ENV === 'test-node' ? './jest.node.setup.js' : './jest.setup.js'",
  "process.env.NODE_ENV === 'test-node' ? '<rootDir>/config/jest/jest.node.setup.js' : '<rootDir>/config/jest/jest.setup.js'"
);

// Write the updated configuration back to the file
fs.writeFileSync(configPath, configContent);

console.log('Jest configuration updated successfully!');
