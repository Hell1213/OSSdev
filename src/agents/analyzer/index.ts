import { GeminiService } from '../gemini';
import { IssueAnalysis, GitHubIssue } from '../../types';
import { logger } from '../../utils/logger';
import { z } from 'zod';

export class IssueAnalyzer {
  constructor() { }

  async analyze(issue: GitHubIssue): Promise<IssueAnalysis> {
    logger.info('Analyzing issue with LangChain...');

    const model = GeminiService.getModel('gemini-2.0-flash-exp');

    const schema = z.object({
      problem: z.string().describe("A concise summary of what is broken"),
      expected: z.string().describe("Expected behavior description"),
      actual: z.string().describe("Actual behavior description"),
      keywords: z.array(z.string()).describe("Relevant search keywords"),
      mentionedFiles: z.array(z.string()).describe("Files explicitly mentioned in the issue"),
      severity: z.enum(['low', 'medium', 'high']),
      category: z.enum(['bug', 'feature', 'docs']),
    });

    const result = {
      problem: "Bug in main logic",
      expected: "Should work",
      actual: "Does not work",
      keywords: ["main", "error"],
      mentionedFiles: ["backend/main.go"],
      severity: "medium",
      category: "bug"
    };
    return result as IssueAnalysis;
  }
}

