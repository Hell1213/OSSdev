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
      isFrontend: z.boolean().describe("Whether this issue primarily involves frontend code (CSS, React, UI)"),
    });

    const structuredModel = model.withStructuredOutput(schema as any, { includeRaw: true } as any);

    const prompt = `You are a Senior Principal Engineer. Analyze this bug report deeply.
    
Issue:
Title: ${issue.title}
Body: ${issue.body}
Labels: ${issue.labels.join(', ')}

1. Identify the core logic failure.
2. Determine if this is a Frontend (UI/UX/CSS) issue.
3. Extract relevant files and keywords for searching.`;

    try {
      const { parsed, raw } = await structuredModel.invoke(prompt) as any;
      if (raw.usage_metadata) {
        GeminiService.trackUsage(
          'gemini-2.0-flash-exp',
          raw.usage_metadata.prompt_token_count || 0,
          raw.usage_metadata.candidates_token_count || 0
        );
      }
      return {
        ...parsed,
        labels: issue.labels
      };
    } catch (e) {
      logger.warn('API for issue analysis failed, using fallback...');
      const isFrontend = issue.labels.some((l: string) => l.toLowerCase().includes('frontend') || l.toLowerCase().includes('ui') || l.toLowerCase().includes('css'));
      return {
        problem: issue.title,
        expected: "Functionality working correctly",
        actual: "Bug reported in issue body",
        keywords: issue.title.split(' ').slice(0, 5),
        mentionedFiles: [],
        severity: "medium",
        category: "bug",
        labels: issue.labels,
        isFrontend
      };
    }
  }
}

