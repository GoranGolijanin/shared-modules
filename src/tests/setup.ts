import dotenv from 'dotenv';

// Load environment variables for tests
dotenv.config();

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for integration tests
jest.setTimeout(30000);
