import ora from 'ora';
import chalk from 'chalk';
import { runFixWorkflow } from '../../orchestrator/workflow';

export async function fixCommand(
  issueUrl: string,
  options: { dryRun?: boolean; maxAttempts?: string; verbose?: boolean; local?: boolean }
): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    if (!issueUrl.includes('github.com/')) {
      spinner.fail('Invalid GitHub URL');
      process.exit(1);
    }

    const result = await runFixWorkflow(issueUrl, {
      dryRun: options.dryRun || false,
      maxAttempts: parseInt(options.maxAttempts || '5'),
      verbose: options.verbose || false,
      useLocal: options.local || false,
    });

    if (result.status === 'success') {
      spinner.succeed(chalk.green('Issue fixed!'));
      console.log(chalk.blue(`\n🎉 PR: ${result.prUrl}`));
    } else {
      spinner.fail(chalk.red('Failed'));
      console.error(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }
  } catch (error: any) {
    spinner.fail('Unexpected error');
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}
