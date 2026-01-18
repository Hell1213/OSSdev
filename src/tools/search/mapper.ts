import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';

export class ProjectMapper {
    async getMap(repoPath: string): Promise<string> {
        logger.info(`Mapping project structure in ${repoPath}`);
        const files = this.walk(repoPath);
        return files.join('\n');
    }

    private walk(dir: string, currentDepth: number = 0, maxDepth: number = 3): string[] {
        if (currentDepth > maxDepth) return [];

        let results: string[] = [];
        try {
            const list = fs.readdirSync(dir);
            for (const file of list) {
                if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'build') continue;

                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                const relativePath = path.relative(process.cwd(), fullPath);

                if (stat && stat.isDirectory()) {
                    results.push(`${'  '.repeat(currentDepth)}📂 ${file}/`);
                    results = results.concat(this.walk(fullPath, currentDepth + 1, maxDepth));
                } else {
                    results.push(`${'  '.repeat(currentDepth)}📄 ${file}`);
                }
            }
        } catch (e) {
            // Skip
        }
        return results;
    }
}
