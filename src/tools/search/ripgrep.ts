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
      args.push('-g', `*.${options.fileType}`);
    }

    try {
      logger.info(`Running rg with args: ${args.join(' ')} in ${repoPath}`);
      const { stdout } = await execa('rg', args, { cwd: repoPath });
      logger.info(`Rg stdout length: ${stdout.length}`);
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

    let currentSnippet: Partial<CodeSnippet> | null = null;

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.type === 'begin') {
          currentSnippet = {
            file: json.data.path.text,
            startLine: 0,
            endLine: 0,
            content: '',
            relevanceScore: 1.0,
          };
        } else if (json.type === 'match' || json.type === 'context') {
          if (currentSnippet) {
            if (currentSnippet.startLine === 0) {
              currentSnippet.startLine = json.data.line_number;
            }
            currentSnippet.endLine = json.data.line_number;
            currentSnippet.content += json.data.lines.text;
          }
        } else if (json.type === 'end') {
          if (currentSnippet && currentSnippet.content) {
            snippets.push(currentSnippet as CodeSnippet);
          }
          currentSnippet = null;
        }
        // Ignore summary and other types
      } catch (error) {
        logger.warn('Failed to parse ripgrep JSON line:', line, error);
      }
    }

    return snippets;
  }
}
