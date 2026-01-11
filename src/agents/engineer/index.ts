import { GeminiAgent } from '../gemini';
import { IssueAnalysis, CodeSnippet, CodeFix, FixFailure } from '../../types';

export class EngineerAgent {
  private gemini: GeminiAgent;

  constructor(apiKey: string) {
    this.gemini = new GeminiAgent(apiKey, 'gemini-2.5-flash');
  }

  async generateFix(
    issue: IssueAnalysis,
    snippets: CodeSnippet[],
    previousFailures: FixFailure[] = []
  ): Promise<CodeFix> {
    const prompt = `You are a senior developer fixing a bug.

Issue: ${issue.problem}

Relevant Code:
${snippets.map(s => `File: ${s.file}\n${s.content}`).join('\n\n')}

${previousFailures.length > 0 ? `Previous attempts failed:\n${previousFailures.map(f => f.error).join('\n')}` : ''}

Generate the FIXED code. Respond with:
File: <filepath>
\`\`\`
<fixed code>
\`\`\``;

    const response = await this.gemini.generate(prompt);

    const fileMatch = response.match(/File: (.+)/);
    const codeMatch = response.match(/```[\w]*\n([\s\S]+?)```/);

    if (!fileMatch || !codeMatch) {
      throw new Error('Failed to parse fix response');
    }

    return {
      file: fileMatch[1].trim(),
      content: codeMatch[1].trim(),
    };
  }

  async diagnoseFail(fix: CodeFix, testError: string): Promise<string> {
    const prompt = `Test failed with this error:

\`\`\`
${testError}
\`\`\`

The code I wrote was:
\`\`\`
${fix.content}
\`\`\`

In ONE sentence, explain:
1. Why this failed
2. What needs to change

Be specific and actionable.`;

    return await this.gemini.generate(prompt);
  }
}
