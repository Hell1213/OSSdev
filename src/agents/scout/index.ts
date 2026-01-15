import { GeminiService } from '../gemini';
import { IssueAnalysis, SearchQuery } from '../../types';
import { logger } from '../../utils/logger';
import { z } from 'zod';

export class ScoutAgent {
  constructor() { }

  async generateSearchQueries(issue: IssueAnalysis, language: string): Promise<SearchQuery[]> {
    logger.info('Generating search queries with LangChain...');
    const model = GeminiService.getModel('gemini-2.0-flash-exp');

    const schema = z.object({
      queries: z.array(z.object({
        pattern: z.string().describe("Regex pattern to search for"),
        fileType: z.string().describe("File extension filter (e.g., ts, py)"),
        contextLines: z.number().describe("Number of lines of context"),
        reason: z.string().describe("Why this query is relevant"),
      }))
    });

    const structuredModel = model.withStructuredOutput(schema as any);

    const prompt = `Issue Keywords: ${issue.keywords.join(', ')}
Language: ${language}
Mentioned Files: ${issue.mentionedFiles.join(', ')}

Generate 3-5 ripgrep queries to find relevant files. Focus on the core problem: ${issue.problem}`;

    try {
      const result = await structuredModel.invoke(prompt);
      return result.queries as SearchQuery[];
    } catch (e) {
      logger.warn('API for search query generation failed, using fallback...');
      return [{
        pattern: issue.keywords[0] || "main",
        fileType: language,
        contextLines: 20,
        reason: "Generic search based on keywords"
      }];
    }
  }
}
