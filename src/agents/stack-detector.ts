import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { RepoFingerprint } from '../types';
import { GeminiService } from './gemini';

export class StackDetectorAgent {
    private model: ChatGoogleGenerativeAI;

    constructor(apiKey: string) {
        this.model = new ChatGoogleGenerativeAI({
            apiKey,
            model: 'gemini-2.0-flash-exp', // Fast model for detection
            temperature: 0,
        });
    }

    async detectStack(repoPath: string): Promise<RepoFingerprint> {
        const fileTree = await this.generateFileTree(repoPath);

        // Read contents of key files for better auditing
        const configFiles = ['package.json', 'go.mod', 'requirements.txt', 'pyproject.toml', 'manage.py'];
        const configContents: Record<string, string> = {};

        for (const file of configFiles) {
            const fullPath = path.join(repoPath, file);
            if (fs.existsSync(fullPath)) {
                try {
                    configContents[file] = fs.readFileSync(fullPath, 'utf8').substring(0, 1000); // First 1000 chars
                } catch { }
            }
        }

        const schema = z.object({
            language: z.string().describe("The primary programming language"),
            runtime: z.string().describe("The runtime environment (e.g., node, python, go, base)"),
            packageManager: z.string().describe("The package manager used"),
            installCommand: z.string().describe("The command to install dependencies"),
            testCommand: z.string().describe("The command to run tests"),
            dependencies: z.array(z.string()).describe("Key dependencies found in config files (e.g. react, lodash, express)")
        });

        const structuredModel = this.model.withStructuredOutput(schema as any, { includeRaw: true } as any);

        const prompt = `You are a Senior Principal Engineer performing an environment audit.
        
File Tree:
${fileTree.join('\n')}

Config File Previews:
${Object.entries(configContents).map(([f, c]) => `--- ${f} ---\n${c}`).join('\n\n')}

Identify the language, runtime, package manager, and provide the standard commands to install dependencies and run tests.
For the runtime, use 'base' if it's a standard linux environment or a specific one like 'node', 'python', etc.
Audit the dependencies carefully to ensure the sandbox setup will be successful.`;

        try {
            const { parsed, raw } = await structuredModel.invoke(prompt) as any;
            if (raw.usage_metadata) {
                GeminiService.trackUsage(
                    'gemini-2.0-flash-exp',
                    raw.usage_metadata.prompt_token_count || 0,
                    raw.usage_metadata.candidates_token_count || 0
                );
            }
            return parsed as RepoFingerprint;
        } catch (e) {
            console.warn('API for stack detection failed, using local fallback...');
            // Fallback logic - Prioritize Python for projects that have both (like Zulip)
            const treeStr = fileTree.join(' ');

            if (treeStr.includes('requirements.txt') || treeStr.includes('pyproject.toml') || treeStr.includes('manage.py')) {
                return {
                    language: "Python",
                    runtime: "base", // Using base to avoid template permission issues
                    packageManager: "pip",
                    installCommand: "pip install -r requirements.txt",
                    testCommand: "python3 manage.py test"
                };
            }
            if (treeStr.includes('package.json')) {
                return {
                    language: "ts",
                    runtime: "base",
                    packageManager: "npm",
                    installCommand: "npm install",
                    testCommand: "npm test"
                };
            }
            if (treeStr.includes('go.mod')) {
                return {
                    language: "Go",
                    runtime: "base",
                    packageManager: "go mod",
                    installCommand: "go mod download",
                    testCommand: "go test ./..."
                };
            }
            // Generic fallback
            return {
                language: "Unknown",
                runtime: "base",
                packageManager: "none",
                installCommand: "echo 'No install command'",
                testCommand: "echo 'No test command'"
            };
        }
    }

    private async generateFileTree(dir: string, depth = 1): Promise<string[]> {
        const files: string[] = [];

        const scan = (currentPath: string, currentDepth: number) => {
            if (currentDepth > depth) return;
            if (files.length > 50) return; // Hard limit to save tokens

            try {
                const items = fs.readdirSync(currentPath);
                for (const item of items) {
                    if (files.length > 50) break;
                    if (item.startsWith('.') || item === 'node_modules' || item === 'dist' || item === 'target' || item === 'build') continue;

                    const fullPath = path.join(currentPath, item);
                    const relativePath = path.relative(dir, fullPath);
                    const stats = fs.statSync(fullPath);

                    if (stats.isDirectory()) {
                        files.push(relativePath + '/');
                        scan(fullPath, currentDepth + 1);
                    } else {
                        files.push(relativePath);
                    }
                }
            } catch (e) {
                // Ignore access errors
            }
        };

        scan(dir, 1);
        return files;
    }
}
