#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import { fixCommand } from './commands/fix';
import { validateConfig } from '../utils/config';

const program = new Command();

program
  .name('oss-dev')
  .description('Autonomous OSS contributor')
  .version('1.0.0');

program
  .command('fix <issue-url>')
  .description('Fix a GitHub issue autonomously')
  .option('--dry-run', 'Analyze only, no PR')
  .option('--max-attempts <n>', 'Max fix attempts', '5')
  .option('--verbose', 'Detailed logs')
  .option('--local', 'Use local repository instead of cloning')
  .action(fixCommand);

try {
  validateConfig();
  program.parse();
} catch (error: any) {
  console.error(chalk.red(error.message));
  process.exit(1);
}
