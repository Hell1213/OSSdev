import { execa } from 'execa';
import { CodeSnippet } from '../../types';
import { logger } from '../../utils/logger';

export class RipgrepSearch {
  async search(
    pattern: string,
    repoPath: string,
    options: { fileType?: string; contextLines?: number } = {}
  ): Promise<CodeSnippet[]> {
    const args = [
      pattern,
      '--json',
      '--context',
      (options.contextLines || 20).toString(),
    ];

    if (options.fileType) {
      args.push('--type', options.fileType);
    }

    try {
      const { stdout } = await execa('rg', args, { cwd: repoPath });
      return this.parse(stdout);
    } catch (error: any) {
      if (error.exitCode === 1) return [];
      logger.error('Ripgrep failed:', error.message);
      return [];
    }
  }

  private parse(output: string): CodeSnippet[] {
    const snippets: CodeSnippet[] = [];
    const lines = output.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.type === 'match') {
          snippets.push({
            file: json.data.path.text,
            startLine: json.data.line_number,
            endLine: json.data.line_number + 20,
            content: json.data.lines.text,
            relevanceScore: 1.0,
          });
        }
      } catch {}
    }

    return snippets;
  }
}
