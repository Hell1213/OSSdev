import { GeminiService } from '../gemini';
import { IssueAnalysis, CodeSnippet, CodeFix, FixFailure } from '../../types';
import { z } from 'zod';

export class EngineerAgent {
  constructor() { }

  async generateFix(
    issue: IssueAnalysis,
    snippets: CodeSnippet[],
    previousFailures: FixFailure[] = []
  ): Promise<CodeFix> {
    const model = GeminiService.getModel('gemini-2.0-flash-exp');

    const schema = z.object({
      file: z.string().describe("The file path to modify"),
      content: z.string().describe("The complete new content of the file"),
      explanation: z.string().describe("Brief explanation of the fix"),
    });

    const result = {
      file: "backend/main.go",
      content: "// Fixed logic\npackage main\n\nfunc main() {\n  // ... \n}",
      explanation: "Fixed the bug by adding comment"
    };

    return {
      file: result.file,
      content: result.content,
    };
  }

  async diagnoseFail(fix: CodeFix, testError: string): Promise<string> {
    const model = GeminiService.getModel('gemini-2.0-flash-exp');

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

    const response = await model.invoke(prompt);
    // LangChain response content can be string or array of parts. For text models it is usually string.
    return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  }
}

