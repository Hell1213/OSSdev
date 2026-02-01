import { GeminiService } from '../gemini';
import { IssueAnalysis, SearchQuery } from '../../types';
import { logger } from '../../utils/logger';
import { z } from 'zod';

export class ScoutAgent {
  constructor() { }

  async generateSearchQueries(issue: IssueAnalysis, language: string, projectMap?: string): Promise<SearchQuery[]> {
    logger.info('Generating search queries with LangChain...');
    const model = GeminiService.getModel('gemini-2.0-flash-exp');

    // Map language to proper file extensions
    const fileExtMap: Record<string, string> = {
      'javascript': 'js',
      'typescript': 'ts',
      'python': 'py',
      'go': 'go',
      'rust': 'rs',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
    };
    const fileExt = fileExtMap[language.toLowerCase()] || language;

    const schema = z.object({
      queries: z.array(z.object({
        pattern: z.string().describe("Regex pattern to search for"),
        fileType: z.string().describe("File extension filter (e.g., ts, py)"),
        contextLines: z.number().describe("Number of lines of context"),
        reason: z.string().describe("Why this query is relevant"),
      }))
    });

    const structuredModel = model.withStructuredOutput(schema as any, { includeRaw: true } as any);

    const prompt = `You are a Codebase Scout. Your mission is to find the EXACT files causing the issue.
    
# Navigation Strategy
1. Use the "Project Structure" to see where related files might live.
2. Use the "Mentioned Files" from the issue context if they exist.
3. If the issue describes a UI bug, look for Frontend components.
4. If it describes an API failure, look for Routes/Controllers/Models.

Project Structure:
${projectMap || 'Unknown'}

Issue: ${issue.problem}
Keywords: ${issue.keywords.join(', ')}
Mentioned Files: ${issue.mentionedFiles.join(', ') || 'None'}
Language: ${language}
File Extension: ${fileExt}

Based on this, generate 3-5 surgical regex patterns. Be precise. Avoid searching for generic terms if a file path is obvious.
Use "${fileExt}" as the fileType for all queries.`;

    try {
      const { parsed, raw } = await structuredModel.invoke(prompt) as any;
      if (raw.usage_metadata) {
        GeminiService.trackUsage(
          'gemini-2.0-flash-exp',
          raw.usage_metadata.prompt_token_count || 0,
          raw.usage_metadata.candidates_token_count || 0
        );
      }
      // Ensure all queries use the correct file extension
      const queries = parsed.queries.map((q: SearchQuery) => ({
        ...q,
        fileType: fileExt
      }));
      return queries as SearchQuery[];
    } catch (e) {
      logger.warn('API for search query generation failed, using fallback...');
      return [{
        pattern: issue.keywords[0] || "main",
        fileType: fileExt,
        contextLines: 20,
        reason: "Generic search based on keywords"
      }];
    }
  }
}
