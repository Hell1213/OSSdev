import * as fs from 'fs';
import * as path from 'path';
import { RepoFingerprint } from '../types';

export function detectStack(repoPath: string): RepoFingerprint {
  // Check root directory first
  if (fs.existsSync(path.join(repoPath, 'package.json'))) {
    return {
      language: 'javascript',
      runtime: 'node:20',
      packageManager: 'npm',
      installCommand: 'npm install',
      testCommand: 'npm test',
    };
  }

  if (fs.existsSync(path.join(repoPath, 'go.mod'))) {
    return {
      language: 'go',
      runtime: 'golang:1.21',
      packageManager: 'go',
      installCommand: 'go mod download',
      testCommand: 'go test ./...',
    };
  }

  if (fs.existsSync(path.join(repoPath, 'requirements.txt'))) {
    return {
      language: 'python',
      runtime: 'python:3.11',
      packageManager: 'pip',
      installCommand: 'pip install -r requirements.txt',
      testCommand: 'pytest',
    };
  }

  if (fs.existsSync(path.join(repoPath, 'Cargo.toml'))) {
    return {
      language: 'rust',
      runtime: 'rust:latest',
      packageManager: 'cargo',
      installCommand: 'cargo build',
      testCommand: 'cargo test',
    };
  }

  // Check common subdirectories for monorepos
  const commonDirs = ['backend', 'server', 'api', 'src'];
  for (const dir of commonDirs) {
    const subPath = path.join(repoPath, dir);
    if (fs.existsSync(subPath)) {
      if (fs.existsSync(path.join(subPath, 'go.mod'))) {
        return {
          language: 'go',
          runtime: 'golang:1.21',
          packageManager: 'go',
          installCommand: `cd ${dir} && go mod download`,
          testCommand: `cd ${dir} && go test ./...`,
        };
      }
      if (fs.existsSync(path.join(subPath, 'package.json'))) {
        return {
          language: 'javascript',
          runtime: 'node:20',
          packageManager: 'npm',
          installCommand: `cd ${dir} && npm install`,
          testCommand: `cd ${dir} && npm test`,
        };
      }
      if (fs.existsSync(path.join(subPath, 'requirements.txt'))) {
        return {
          language: 'python',
          runtime: 'python:3.11',
          packageManager: 'pip',
          installCommand: `cd ${dir} && pip install -r requirements.txt`,
          testCommand: `cd ${dir} && pytest`,
        };
      }
    }
  }

  throw new Error('Unsupported language');
}
