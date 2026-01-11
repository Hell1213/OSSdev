import { Sandbox } from '@e2b/code-interpreter';
import { RepoFingerprint, TestResult } from '../types';
import { logger } from '../utils/logger';

export class E2BSandbox {
  private sandbox: Sandbox | null = null;

  async provision(repoUrl: string, fingerprint: RepoFingerprint): Promise<void> {
    logger.info('Creating E2B sandbox...');

    this.sandbox = await Sandbox.create(fingerprint.runtime, {
      timeoutMs: 900000
    });

    await this.sandbox.commands.run(`git clone ${repoUrl} /workspace`);
    await this.sandbox.commands.run('cd /workspace');

    await this.sandbox.commands.run(fingerprint.installCommand);

    logger.success('Sandbox ready');
  }

  async runTests(testCommand: string): Promise<TestResult> {
    if (!this.sandbox) throw new Error('Sandbox not initialized');

    const start = Date.now();
    const result = await this.sandbox.commands.run(testCommand);

    return {
      passed: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr,
      exitCode: result.exitCode,
      duration: Date.now() - start,
    };
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    if (!this.sandbox) throw new Error('Sandbox not initialized');
    await this.sandbox.files.write(filePath, content);
  }

  async cleanup(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.kill();
      this.sandbox = null;
    }
  }
}
