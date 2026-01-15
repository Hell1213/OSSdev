import { StateGraph, END } from '@langchain/langgraph';
import { IssueAnalysis, RepoFingerprint, CodeSnippet, CodeFix, TestResult, WorkflowResult, AgentState } from '../types';
import { StackDetectorAgent } from '../agents/stack-detector';
import { IssueAnalyzer } from '../agents/analyzer';
import { ScoutAgent } from '../agents/scout';
import { EngineerAgent } from '../agents/engineer';
import { E2BSandbox } from '../sandbox/e2b';
import { GitHubClient } from '../tools/github/client';
import { RipgrepSearch } from '../tools/search/ripgrep';
import { parseIssueUrl } from '../tools/github/parser';
import { logger } from '../utils/logger';

// --- Nodes ---

async function detectStackNode(state: AgentState): Promise<Partial<AgentState>> {
    logger.info(' Step: Detect Stack');
    // In a real scenario, we might clone here if not already done.
    // We assume repoPath is set by the workflow runner (which clones).
    if (!state.repoPath) throw new Error("Repo path missing");

    const detector = new StackDetectorAgent(process.env.GEMINI_API_KEY!);
    const fingerprint = await detector.detectStack(state.repoPath);
    logger.info(`Detected: ${fingerprint.language}`);

    // Also set max attempts here if needed, or keep default
    return { fingerprint };
}

async function analyzeIssueNode(state: AgentState): Promise<Partial<AgentState>> {
    logger.info(' Step: Analyze Issue');
    const { owner, repo, issueNumber } = parseIssueUrl(state.issueUrl);
    const github = new GitHubClient(process.env.GITHUB_TOKEN!);
    const issue = await github.getIssue(owner, repo, issueNumber);

    const analyzer = new IssueAnalyzer();
    const analysis = await analyzer.analyze(issue); // analyzer now creates its own GeminiService

    return { issueAnalysis: analysis };
}

async function searchCodeNode(state: AgentState): Promise<Partial<AgentState>> {
    logger.info(' Step: Search Code');
    if (!state.issueAnalysis || !state.fingerprint || !state.repoPath) {
        throw new Error("Missing data for search");
    }

    const scout = new ScoutAgent();
    const queries = await scout.generateSearchQueries(state.issueAnalysis, state.fingerprint.language);

    const ripgrep = new RipgrepSearch();
    const snippets: CodeSnippet[] = [];

    for (const q of queries) {
        try {
            const results = await ripgrep.search(q.pattern, state.repoPath, {
                fileType: q.fileType,
                contextLines: q.contextLines,
            });
            snippets.push(...results);
        } catch (e) {
            logger.warn(`Search failed for ${q.pattern}: ${e}`);
        }
    }

    logger.info(`Found ${snippets.length} snippets`);
    return { contextSnippets: snippets };
}

async function generateFixNode(state: AgentState): Promise<Partial<AgentState>> {
    const attempt = state.attempts + 1;
    logger.info(` Step: Generate Fix (Attempt ${attempt})`);

    const engineer = new EngineerAgent();
    // We need to define previousFailures. In state only `testResults` (failures) are stored.
    // We need to map `testResults` back to `FixFailure` format or just pass relevant context.
    // Agent definitions for generateFix takes `previousFailures`.

    // Let's reconstruct failure history from state.messages or state.testResults + old fixes?
    // Our State definition has `testResults` and `currentFix`. 
    // But `testResults` is an array. We need to pair them with the fix that caused them.
    // Ideally, we should store a history of {fix, error} in state.
    // For now, let's assume we can pass simple error strings or we update state schema to store full history.
    // Simpler: Just pass the last error if any, or all errors.

    const previousFailures = state.testResults.map((tr, i) => ({
        fix: { file: '', content: '' }, // We might not have saved the historic fix content in `testResults`.
        error: tr.error,
        diagnosis: '', // We could store diagnosis too
        attempt: i + 1
    }));

    const fix = await engineer.generateFix(
        state.issueAnalysis!,
        state.contextSnippets,
        state.fingerprint?.language || 'unknown',
        previousFailures
    );

    return { currentFix: fix, attempts: attempt };
}

async function verifyFixNode(state: AgentState): Promise<Partial<AgentState>> {
    logger.info(' Step: Verify Fix');
    if (!state.sandbox || !state.currentFix || !state.fingerprint) {
        throw new Error("Sandbox or Fix missing");
    }

    await state.sandbox.writeFile(state.currentFix.file, state.currentFix.content);

    const result = await state.sandbox.runTests(state.fingerprint.testCommand);

    if (result.passed) {
        logger.success(' Tests Passed');
        return { status: 'success', testResults: [result] };
    } else {
        logger.warn(' Tests Failed');
        return { status: 'running', testResults: [result] }; // Keep running
    }
}

// --- Graph Definition ---

function shouldContinue(state: AgentState) {
    if (state.status === 'success') return END;
    if (state.attempts >= state.maxAttempts) {
        state.status = 'failed';
        return END; // Or go to failure node
    }
    return "generate_fix"; // Retry
}

export const createFixGraph = () => {
    const workflow = new StateGraph<any>({
        channels: {
            issueUrl: { value: (x: any, y: any) => y ?? x, default: () => "" },
            issueAnalysis: { value: (x: any, y: any) => y ?? x, default: () => undefined },
            repoPath: { value: (x: any, y: any) => y ?? x, default: () => undefined },
            fingerprint: { value: (x: any, y: any) => y ?? x, default: () => undefined },
            contextSnippets: { value: (x: any, y: any) => y ?? x, default: () => [] },
            currentFix: { value: (x: any, y: any) => y ?? x, default: () => undefined },
            testResults: { value: (x: any, y: any) => x.concat(y), default: () => [] },
            attempts: { value: (x: any, y: any) => y ?? x, default: () => 0 },
            maxAttempts: { value: (x: any, y: any) => x, default: () => 5 },
            sandbox: { value: (x: any, y: any) => x, default: () => undefined },
            status: { value: (x: any, y: any) => y ?? x, default: () => 'running' },
            error: { value: (x: any, y: any) => y ?? x, default: () => undefined },
        }
    }) as any;

    workflow.addNode("detect_stack", detectStackNode);
    workflow.addNode("analyze_issue", analyzeIssueNode);
    // workflow.addNode("detect_stack", detectStackNode); // We need strict ordering?
    // LangGraph allows defining flow.

    workflow.addNode("search_code", searchCodeNode);
    workflow.addNode("generate_fix", generateFixNode);
    workflow.addNode("verify_fix", verifyFixNode);

    // Flow
    workflow.setEntryPoint("analyze_issue" as any);
    workflow.addEdge("analyze_issue" as any, "detect_stack" as any);
    workflow.addEdge("detect_stack" as any, "search_code" as any);
    workflow.addEdge("search_code" as any, "generate_fix" as any);
    workflow.addEdge("generate_fix" as any, "verify_fix" as any);

    workflow.addConditionalEdges(
        "verify_fix" as any,
        shouldContinue,
        {
            generate_fix: "generate_fix",
            [END]: END
        }
    );

    return workflow.compile();
};
