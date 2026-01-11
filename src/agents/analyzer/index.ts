import { GeminiAgent } from '../gemini';
import { IssueAnalysis, GitHubIssue } from '../../types';
import { logger } from '../../utils/logger';

export class IssueAnalyzer {
  private gemini: GeminiAgent;

  constructor(apiKey: string) {
    this.gemini = new GeminiAgent(apiKey, 'gemini-2.5-flash');
  }

  async analyze(issue: GitHubIssue): Promise<IssueAnalysis> {
    logger.info('Analyzing issue...');

    const prompt = `You are a senior engineer analyzing a bug report.

Issue:
Title: ${issue.title}
Body: ${issue.body}
Labels: ${issue.labels.join(', ')}

Extract in JSON:
{
  "problem": "What's broken? (1-2 sentences)",
  "expected": "Expected behavior",
  "actual": "Actual behavior",
  "keywords": ["relevant", "terms"],
  "mentionedFiles": ["src/file.js"],
  "severity": "low|medium|high",
  "category": "bug|feature|docs"
}`;

    return await this.gemini.generateJSON<IssueAnalysis>(prompt);
  }
}
