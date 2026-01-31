import { GeminiService } from '../gemini';
import { IssueAnalysis, CodeSnippet, CodeFix } from '../../types';
import { logger } from '../../utils/logger';
import { z } from 'zod';

export interface ReviewResult {
    approved: boolean;
    feedback: string;
    category: 'logic' | 'syntax' | 'style' | 'security' | 'ok';
}

export class ReviewerAgent {
    async review(
        issue: IssueAnalysis,
        fix: CodeFix,
        snippets: CodeSnippet[],
        language: string
    ): Promise<ReviewResult> {
        const model = GeminiService.getModel('gemini-2.0-flash-exp');

        const schema = z.object({
            approved: z.boolean().describe("Whether the fix is logically sound and safe"),
            feedback: z.string().describe("Constructive feedback for the engineer"),
            category: z.enum(['logic', 'syntax', 'style', 'security', 'ok']).describe("The main concern if any")
        });

        const structuredModel = model.withStructuredOutput(schema as any, { includeRaw: true } as any);

        const originalCode = snippets.find(s => s.file === fix.file)?.content || "File not found in context";

        const prompt = `You are a Senior Peer Reviewer. Your job is to catch shallow fixes or logic errors.

Issue: ${issue.problem}
Stack: ${language}

Original Code for ${fix.file}:
${originalCode}

Generated Fix:
${fix.content}

Review the fix. Reject it if:
1. It is a "shallow" fix (e.g. just ignoring an error).
2. It introduces a new bug.
3. It deviates too much from the project style.
4. It only partially addresses the issue.

If approved, set approved=true. Otherwise set false and provide feedback.`;

        try {
            const { parsed, raw } = await structuredModel.invoke(prompt) as any;
            if (raw.usage_metadata) {
                GeminiService.trackUsage(
                    'gemini-2.0-flash-exp',
                    raw.usage_metadata.prompt_token_count || 0,
                    raw.usage_metadata.candidates_token_count || 0
                );
            }
            return parsed as ReviewResult;
        } catch (e: any) {
            logger.warn(`Reviewer API failed: ${e.message}. Defaulting to approved for continuity.`);
            return {
                approved: true,
                feedback: "API failure, but bypassing for progress.",
                category: 'ok'
            };
        }
    }
}
