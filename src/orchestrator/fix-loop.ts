import { E2BSandbox } from '../sandbox/e2b';
import { EngineerAgent } from '../agents/engineer';
import { IssueAnalysis, CodeSnippet, CodeFix, FixFailure } from '../types';
import { logger } from '../utils/logger';

export async function runFixLoop(
  issue: IssueAnalysis,
  snippets: CodeSnippet[],
  sandbox: E2BSandbox,
  testCommand: string,
  apiKey: string,
  maxAttempts: number = 5
): Promise<{ success: boolean; fix?: CodeFix; attempts: number }> {
  const engineer = new EngineerAgent(apiKey);
  const previousFailures: FixFailure[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info(`Fix attempt ${attempt}/${maxAttempts}`);

    const fix = await engineer.generateFix(issue, snippets, previousFailures);

    await sandbox.writeFile(fix.file, fix.content);

    const testResult = await sandbox.runTests(testCommand);

    if (testResult.passed) {
      logger.success(`Tests passed on attempt ${attempt}!`);
      return { success: true, fix, attempts: attempt };
    }

    logger.warn(`Tests failed: ${testResult.error.slice(0, 200)}`);
    
    const diagnosis = await engineer.diagnoseFail(fix, testResult.error);
    
    previousFailures.push({ 
      fix, 
      error: testResult.error, 
      diagnosis,
      attempt 
    });
  }

  logger.error(`Failed after ${maxAttempts} attempts`);
  return { success: false, attempts: maxAttempts };
}
