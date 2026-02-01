import { Sandbox } from '@e2b/code-interpreter';
import { RepoFingerprint, TestResult } from '../types';
import { logger } from '../utils/logger';

export class E2BSandbox {
  private sandbox: Sandbox | null = null;

  async provision(githubUrl: string, fingerprint: RepoFingerprint, localPath?: string): Promise<void> {
    logger.info('Creating E2B sandbox...');

    let template = fingerprint.runtime;
    if (template === 'base' || template === 'ubuntu' || template === 'default') {
      template = undefined as any;
    }

    try {
      this.sandbox = await Sandbox.create(template, {
        timeoutMs: 900000
      });
    } catch (e: any) {
      logger.warn(`Failed to create sandbox with template ${template}: ${e.message}. Falling back to default.`);
      this.sandbox = await Sandbox.create(undefined as any, {
        timeoutMs: 900000
      });
    }
    logger.info('Sandbox instance created.');

    const repoDir = 'repo';

    if (localPath) {
      logger.info(`Syncing local repository: ${localPath}`);
      await this.syncLocalRepo(localPath, repoDir);
    } else {
      let clone;
      try {
        clone = await this.sandbox.commands.run(`git clone ${githubUrl} ${repoDir}`);
      } catch (e: any) {
        logger.error(`Git clone threw error: ${e.message}`);
        throw e;
      }

      if (clone.exitCode !== 0) {
        throw new Error(`Git clone failed with ${clone.exitCode}`);
      }
    }

    // E2B environment defaults to /home/user
    const absRepoPath = '/home/user/repo';

    // Check if go exists for Go projects
    if (fingerprint.language.toLowerCase() === 'go') {
      try {
        await this.sandbox.commands.run('go version');
      } catch (e) {
        logger.warn('Go not found, installing...');
        await this.sandbox.commands.run('sudo apt-get update && sudo apt-get install -y golang');
      }
    }

    // Install dependencies
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

  private async syncLocalRepo(localPath: string, remotePath: string): Promise<void> {
    const { execSync } = await import('child_process');
    const fs = await import('fs');
    const path = await import('path');

    try {
      const tarPath = path.join('/tmp', `oss-dev-sync-${Date.now()}.tar`);
      execSync(`git archive --format=tar -o ${tarPath} HEAD`, { cwd: localPath });

      const tarContent = await fs.promises.readFile(tarPath);

      await this.sandbox!.commands.run(`mkdir -p ${remotePath}`);
      const remoteTarPath = '/tmp/repo.tar';

      try {
        await this.sandbox!.files.write(remoteTarPath, tarContent as any);
      } catch {
        await this.sandbox!.files.write(remoteTarPath, tarContent.toString('base64'));
        await this.sandbox!.commands.run(`base64 -d ${remoteTarPath} > ${remoteTarPath}.tmp && mv ${remoteTarPath}.tmp ${remoteTarPath}`);
      }

      await this.sandbox!.commands.run(`tar -xf ${remoteTarPath} -C ${remotePath}`);
      await fs.promises.unlink(tarPath);
    } catch (error: any) {
      logger.error(`Failed to sync local repo: ${error.message}`);
      throw error;
    }
  }

  async readFile(filePath: string): Promise<string> {
    if (!this.sandbox) throw new Error('Sandbox not initialized');
    return await this.sandbox.files.read(filePath);
  }

  async readFile(filePath: string): Promise<string> {
    if (!this.sandbox) throw new Error('Sandbox not initialized');
    return await this.sandbox.files.read(filePath);
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
