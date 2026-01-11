import { GeminiAgent } from '../gemini';
import { IssueAnalysis, SearchQuery } from '../../types';
import { logger } from '../../utils/logger';

export class ScoutAgent {
  private gemini: GeminiAgent;

  constructor(apiKey: string) {
    this.gemini = new GeminiAgent(apiKey, 'gemini-2.5-flash');
  }

  async generateSearchQueries(issue: IssueAnalysis, language: string): Promise<SearchQuery[]> {
    logger.info('Generating search queries...');

    const prompt = `Issue Keywords: ${issue.keywords.join(', ')}
Language: ${language}

Generate 3-5 ripgrep queries to find relevant files.

JSON array:
[
  {
    "pattern": "LoginButton",
    "fileType": "jsx",
    "contextLines": 20,
    "reason": "Component definition"
  }
]`;

    return await this.gemini.generateJSON<SearchQuery[]>(prompt);
  }
}
