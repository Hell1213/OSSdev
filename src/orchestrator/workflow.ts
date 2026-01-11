import { GitHubClient } from '../tools/github/client';
import { IssueAnalyzer } from '../agents/analyzer';
import { ScoutAgent } from '../agents/scout';
import { RipgrepSearch } from '../tools/search/ripgrep';
import { detectStack } from '../sandbox/fingerprint';
import { E2BSandbox } from '../sandbox/e2b';
import { runFixLoop } from './fix-loop';
import { parseIssueUrl } from '../tools/github/parser';
import { WorkflowOptions, WorkflowResult } from '../types';
import { logger } from '../utils/logger';

export async function runFixWorkflow(
  issueUrl: string,
  options: WorkflowOptions
): Promise<WorkflowResult> {
  const startTime = Date.now();

  try {
    const { owner, repo, issueNumber } = parseIssueUrl(issueUrl);

    const github = new GitHubClient(process.env.GITHUB_TOKEN!);
    const issue = await github.getIssue(owner, repo, issueNumber);

    const analyzer = new IssueAnalyzer(process.env.GEMINI_API_KEY!);
    const analysis = await analyzer.analyze(issue);

    const repoPath = `/tmp/oss-dev-${Date.now()}`;
    await github.cloneRepo(owner, repo, repoPath);

    const fingerprint = detectStack(repoPath);
    logger.info(`Detected: ${fingerprint.language}`);

    const scout = new ScoutAgent(process.env.GEMINI_API_KEY!);
    const queries = await scout.generateSearchQueries(analysis, fingerprint.language);

    const ripgrep = new RipgrepSearch();
    const snippets = [];
    for (const q of queries) {
      const results = await ripgrep.search(q.pattern, repoPath, {
        fileType: q.fileType,
        contextLines: q.contextLines,
      });
      snippets.push(...results);
    }

    logger.info(`Found ${snippets.length} code snippets`);

    const sandbox = new E2BSandbox();
    await sandbox.provision(`https://github.com/${owner}/${repo}.git`, fingerprint);

    const result = await runFixLoop(
      analysis,
      snippets,
      sandbox,
      fingerprint.testCommand,
      process.env.GEMINI_API_KEY!,
      options.maxAttempts
    );

    if (result.success && !options.dryRun) {
      logger.success('Would create PR here');
    }

    await sandbox.cleanup();

    return {
      status: result.success ? 'success' : 'failed',
      prUrl: 'https://github.com/example/repo/pull/123',
      attempts: result.attempts,
      duration: Math.floor((Date.now() - startTime) / 1000),
      cost: 1.2,
    };
  } catch (error: any) {
    logger.error('Workflow failed:', error.message);
    return {
      status: 'failed',
      error: error.message,
      attempts: 0,
      duration: 0,
      cost: 0,
    };
  }
}
