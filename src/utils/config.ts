import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  geminiApiKey: string;
  githubToken: string;
  e2bApiKey: string;
  logLevel: string;
  maxCost: number;
}

export const config: Config = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  githubToken: process.env.GITHUB_TOKEN || '',
  e2bApiKey: process.env.E2B_API_KEY || '',
  logLevel: process.env.OSS_DEV_LOG_LEVEL || 'info',
  maxCost: parseFloat(process.env.OSS_DEV_MAX_COST || '2.00'),
};

export function validateConfig(): void {
  const required = ['GEMINI_API_KEY', 'GITHUB_TOKEN', 'E2B_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
