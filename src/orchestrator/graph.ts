import { StateGraph, END } from '@langchain/langgraph';
import chalk from 'chalk';
import { IssueAnalysis, RepoFingerprint, CodeSnippet, CodeFix, TestResult, WorkflowResult, AgentState, SearchQuery } from '../types';
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

    // If fingerprint already exists (pre-detected by setup), skip re-detection.
    if (state.fingerprint) {
        logger.info('Fingerprint already present in state — skipping detectStackNode.');
        return {};
    }

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

    const { ProjectMapper } = await import('../tools/search/mapper');
    const mapper = new ProjectMapper();
    const projectMap = state.projectMap || await mapper.getMap(state.repoPath);

    const scout = new ScoutAgent();
    const queries = await scout.generateSearchQueries(
        state.issueAnalysis,
        state.fingerprint.language,
        projectMap
    );

    const ripgrep = new RipgrepSearch();
    let snippets: CodeSnippet[] = [];

    const runSearch = async (searchQueries: SearchQuery[]) => {
        const results: CodeSnippet[] = [];
        for (const q of searchQueries) {
            try {
                const searchResult = await ripgrep.search(q.pattern, state.repoPath!, {
                    fileType: q.fileType,
                    contextLines: q.contextLines,
                });
                results.push(...searchResult);
            } catch (e) {
                logger.warn(`Search failed for ${q.pattern}: ${e}`);
            }
        }
        return results;
    };

    snippets = await runSearch(queries);

    // Deep Search Fallback: If no snippets found, try a broader search
    if (snippets.length === 0) {
        logger.warn(' No snippets found. Triggering Deep Search...');
        const broadQueries: SearchQuery[] = (state.issueAnalysis?.keywords || []).map(k => ({
            pattern: k,
            fileType: state.fingerprint?.language || 'ts',
            contextLines: 10,
            reason: "Broad keyword search"
        }));
        snippets = await runSearch(broadQueries);
    }

    logger.info(`Found ${snippets.length} snippets`);
    return { contextSnippets: snippets, projectMap };
}

async function generateFixNode(state: AgentState): Promise<Partial<AgentState>> {
    const attempt = state.attempts + 1;
    logger.info(` Step: Generate Fix (Attempt ${attempt})`);

    const engineer = new EngineerAgent();
    // Include review feedback if we are retrying due to a rejection
    const previousFailures = state.testResults.map((tr, i) => ({
        fix: { file: '', content: '' },
        error: tr.error,
        diagnosis: '',
        attempt: i + 1
    }));

    if (state.reviewFeedback) {
        logger.info(` Incorporating Review Feedback: ${state.reviewFeedback.substring(0, 50)}...`);
    }

    const fix = await engineer.generateFix(
        state.issueAnalysis!,
        state.contextSnippets,
        state.fingerprint?.language || 'unknown',
        previousFailures
    );

    return { currentFix: fix, attempts: attempt, reviewFeedback: undefined };
}

async function reviewFixNode(state: AgentState): Promise<Partial<AgentState>> {
    logger.info(' Step: Review Fix');
    if (!state.currentFix || !state.issueAnalysis) throw new Error("Missing data for review");

    const { ReviewerAgent } = await import('../agents/reviewer');
    const reviewer = new ReviewerAgent();
    const result = await reviewer.review(
        state.issueAnalysis,
        state.currentFix,
        state.contextSnippets,
        state.fingerprint?.language || 'unknown'
    );

    if (result.approved) {
        logger.success(' Review Approved');
        return { reviewFeedback: undefined };
    } else {
        logger.warn(` Review Rejected: ${result.category}`);
        return { reviewFeedback: result.feedback };
    }
}

async function verifyFixNode(state: AgentState): Promise<Partial<AgentState>> {
    logger.info(' Step: Verify Fix');
    if (!state.sandbox || !state.currentFix || !state.fingerprint) {
        throw new Error("Sandbox or Fix missing");
    }

    await state.sandbox.writeFile(state.currentFix.file, state.currentFix.content);

    // Run automated tests first
    const result = await state.sandbox.runTests(state.fingerprint.testCommand);

    if (state.issueAnalysis?.isFrontend) {
        logger.info(chalk.magenta(' 🎨 Frontend Issue Detected. Visual verification recommended.'));
        if (result.passed) {
            logger.success(' Automated tests passed.');
        } else {
            logger.warn(' Automated tests failed or not found.');
        }

        // Logic to ask user for local verification
        const readline = await import('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const answer = await new Promise(resolve => {
            rl.question(chalk.cyan(' Please verify the fix on your localhost. Is it working as expected? (y/n): '), (ans) => {
                rl.close();
                resolve(ans.toLowerCase());
            });
        });

        if (answer === 'y') {
            return { status: 'success', testResults: [result] };
        } else {
            logger.warn(' User rejected frontend verification.');
            return { status: 'running', testResults: [result], error: 'User rejected visual verification' };
        }
    }

    if (result.passed) {
        logger.success(' Tests Passed');
        return { status: 'success', testResults: [result] };
    } else {
        logger.warn(' Tests Failed');
        return { status: 'running', testResults: [result] }; // Keep running
    }
}

async function submitFixNode(state: AgentState): Promise<Partial<AgentState>> {
    const { execSync } = await import('child_process');
    const fs = await import('fs');
    const path = await import('path');

    if (state.dryRun) {
        logger.info(' Step: Submit Fix (Skipped due to dry-run)');
        return { prUrl: 'DRY-RUN-NO-PR' };
    }

    logger.info(' Step: Submit Fix (Creating PR)');
    try {
        const { owner, repo, issueNumber } = parseIssueUrl(state.issueUrl);
        const github = new GitHubClient(process.env.GITHUB_TOKEN!);

        if (!state.currentFix || !state.repoPath || !state.sandbox) {
            throw new Error("Missing data for submission");
        }

        const modifiedContent = await state.sandbox.readFile(state.currentFix.file);
        const localFilePath = path.join(state.repoPath, state.currentFix.file);
        fs.writeFileSync(localFilePath, modifiedContent);

        const branchName = `fix/issue-${issueNumber}-${Date.now()}`;
        const opts = { cwd: state.repoPath };

        execSync(`git checkout -b ${branchName}`, opts);
        execSync(`git add .`, opts);
        execSync(`git config user.name "OSS_dev Agent"`, opts);
        execSync(`git config user.email "agent@oss-dev.local"`, opts);
        execSync(`git commit -m "Fix issue #${issueNumber}"`, opts);

        const remoteUrl = `https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${owner}/${repo}.git`;
        execSync(`git push ${remoteUrl} ${branchName}`, opts);

        const pr = await github.createPR(
            owner,
            repo,
            `Fix for Issue #${issueNumber}`,
            `This PR was automatically generated by OSS_dev.\n\n### Issue Analysis\n${state.issueAnalysis?.problem}`,
            branchName
        );

        return { prUrl: pr.url };
    } catch (e: any) {
        logger.error(`Submission failed: ${e.message}`);
        return { error: `PR creation failed: ${e.message}` };
    }
}

// --- Graph Definition ---

function shouldContinue(state: AgentState) {
    if (state.status === 'success') return "submit_fix";
    if (state.attempts >= state.maxAttempts) {
        state.status = 'failed';
        return END;
    }
    return "generate_fix";
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
            reviewFeedback: { value: (x: any, y: any) => y ?? x, default: () => undefined },
        }
    }) as any;

    workflow.addNode("detect_stack", detectStackNode);
    workflow.addNode("analyze_issue", analyzeIssueNode);
    workflow.addNode("search_code", searchCodeNode);
    workflow.addNode("generate_fix", generateFixNode);
    workflow.addNode("review_fix", reviewFixNode);
    workflow.addNode("verify_fix", verifyFixNode);
    workflow.addNode("submit_fix", submitFixNode);

    // Flow
    workflow.setEntryPoint("analyze_issue" as any);
    workflow.addEdge("analyze_issue" as any, "detect_stack" as any);
    workflow.addEdge("detect_stack" as any, "search_code" as any);
    workflow.addEdge("search_code" as any, "generate_fix" as any);
    workflow.addEdge("generate_fix" as any, "review_fix" as any);

    workflow.addConditionalEdges(
        "review_fix" as any,
        (state: AgentState) => state.reviewFeedback ? "generate_fix" : "verify_fix",
        {
            generate_fix: "generate_fix",
            verify_fix: "verify_fix"
        }
    );

    workflow.addConditionalEdges(
        "verify_fix" as any,
        shouldContinue,
        {
            generate_fix: "generate_fix",
            submit_fix: "submit_fix",
            [END]: END
        }
    );

    workflow.addEdge("submit_fix" as any, END);

    return workflow.compile();
};