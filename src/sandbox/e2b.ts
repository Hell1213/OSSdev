import { Sandbox } from '@e2b/code-interpreter';
import { RepoFingerprint, TestResult } from '../types';
import { logger } from '../utils/logger';

export class E2BSandbox {
  private sandbox: Sandbox | null = null;

  async provision(repoUrl: string, fingerprint: RepoFingerprint): Promise<void> {
    logger.info('Creating E2B sandbox...');

    let template = fingerprint.runtime;
    // Fallback for common generic names
    if (template === 'base' || template === 'ubuntu' || template === 'default') {
      template = undefined as any;
    }

    this.sandbox = await Sandbox.create(template, {
      timeoutMs: 900000
    });
    logger.info('Sandbox instance created.');

    // We strictly use relative path 'repo' to avoid permission issues with /workspace
    const repoDir = 'repo';
    let clone;
    try {
      clone = await this.sandbox.commands.run(`git clone ${repoUrl} ${repoDir}`);
    } catch (e: any) {
      logger.error(`Git clone threw error: ${e.message}`);
      if (e.stderr) logger.error(`Stderr: ${e.stderr}`);
      if (e.stdout) logger.error(`Stdout: ${e.stdout}`);
      throw e;
    }

    if (clone.exitCode !== 0) {
      logger.error(`Git clone stderr: ${clone.stderr}`);
      logger.error(`Git clone stdout: ${clone.stdout}`);
      throw new Error(`Git clone failed with ${clone.exitCode}`);
    }

    // We must pass cwd option to subsequent commands or cd?
    // E2B commands are stateless unless we persist context?
    // Wait, commands run in separate sessions? No, they share the sandbox state.
    // BUT `cd repo` command effects might persist?
    // E2B Code Interpreter persists PWD if we chain them? 
    // Actually, `sandbox.commands.run` runs in the *default* working directory usually.
    // Changing PWD in one command might NOT affect the next?
    // E2B docs say "Process" is persistent?
    // Let's verify. Usually we should pass `cwd` argument to `run`.
    // BUT I don't see `cwd` in my usage.
    // If I cannot change PWD globally, I must use `cwd` option or absolute paths.
    // If I cloned to `repo` (relative to `/home/user`), then path is `/home/user/repo`.

    // To be safe, I'll use absolute path for next commands or assume state persistence.
    // But `cd` command might be useless if shell exits.
    // Let's assume we need to `cd` in every command OR assume persistence.
    // The previous code had `await this.sandbox.commands.run('cd /workspace/repo');`.
    // If that worked (conceptually), persistence was assumed.

    // Let's find out CWD. It was `/home/user`.
    // Valid path is `/home/user/repo`.
    // I will try to use `cwd` option if available, otherwise chain `cd /home/user/repo && ...`
    // Wait, I can't easily refactor `fingerprint.installCommand`.
    // I will try to change global CWD if E2B supports it, or just `cd`.

    // E2B environment might not persist CWD across execs, so we must be safe.
    // The relative repo path is 'repo'. Absolute is /home/user/repo.
    const absRepoPath = '/home/user/repo';

    // Check if go exists for Go projects
    if (fingerprint.language.toLowerCase() === 'go') {
      try {
        await this.sandbox.commands.run('go version');
      } catch (e) {
        logger.warn('Go not found, installing...');
        // Very simplified install for Debian/Ubuntu
        await this.sandbox.commands.run('sudo apt-get update && sudo apt-get install -y golang');
      }
    }

    // Install dependencies
    // Chain cd to ensure we are in the repo
    const installCmd = `cd ${absRepoPath} && ${fingerprint.installCommand}`;
    try {
      const install = await this.sandbox.commands.run(installCmd);
      if (install.exitCode !== 0) {
        logger.warn(`Install command failed: ${install.stderr}`);
      }
    } catch (e: any) {
      logger.warn(`Install command threw: ${e.message}`);
    }

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
