import { createFixGraph } from './graph';
import { E2BSandbox } from '../sandbox/e2b';
import { GitHubClient } from '../tools/github/client';
import { parseIssueUrl } from '../tools/github/parser';
import { WorkflowOptions, WorkflowResult, AgentState } from '../types';
import { logger } from '../utils/logger';

export async function runFixWorkflow(
  issueUrl: string,
  options: WorkflowOptions
): Promise<WorkflowResult> {
  const startTime = Date.now();
  let sandbox: E2BSandbox | undefined;

  try {
    const { owner, repo } = parseIssueUrl(issueUrl);
    const github = new GitHubClient(process.env.GITHUB_TOKEN!);

    let repoPath: string;
    if (options.useLocal) {
      repoPath = process.cwd();
      logger.info(`Using local repository at ${repoPath}`);
    } else {
      repoPath = `/tmp/oss-dev-${Date.now()}`;
      await github.cloneRepo(owner, repo, repoPath);
    }

    sandbox = new E2BSandbox();
    // We provision sandbox later? DetectStack needs to happen before provision?
    // Actually, `detectStack` gives us the runtime image needed for sandbox!
    // So we CANNOT pass a provisioned sandbox at start if we don't know the stack.
    // BUT, the graph is: Analyze -> Detect -> Search -> Fix -> Verify.
    // Detect Stack runs inside the graph.
    // Verify Fix needs sandbox.
    // So we should provision sandbox AFTER Detect Stack node?
    // OR we provision a generic sandbox and install things? E2B usually prefers image selection at start.
    // Plan:
    // 1. Run Detect Stack logic *outside* graph or as first node, then provision sandbox, then run rest?
    // 2. Or let the graph handle provisioning? But passing sandbox instance is tricky if it needs init.
    // Let's keep it simple: Clone & Detect Stack *BEFORE* graph starts (or partially outside).
    // The previous implementation detected stack, then provisioned.
    // To adhere to "Adaptive", we must detect stack first.
    // Let's run detectStackNode manually or use the agent directly here, then init Sandbox, then run Graph.
    // OR, we make the graph responsible for everything. But `sandbox` object needs to be put in state.
    // Let's instantiate Sandbox but NOT provision it until we know the stack.

    // Better approach:
    // 1. Clone.
    // 2. Detect Stack (using Agent directly).
    // 3. Provision Sandbox.
    // 4. Run Graph (Analyze -> Search -> Fix -> Verify).
    // This removes 'Detect' from the graph, but simplifies dependency injection.
    // However, the Graph defines the "Agentic Workflow".

    // Let's stick to the graph having `detect_stack`.
    // We will initialize the sandbox in the `verify_fix` node if it's not ready?
    // Passing a mutable sandbox object reference is fine for this single-process CLI.

    // For now, I will keep the original flow logic roughly: 
    // Clone -> Detect -> Provision -> Graph Loop.
    // This allows the graph to focus on the "Fix Loop" which is the complex part with retries.
    // Wait, the plan said "Nodes: detect_stack, ...". 
    // If I put detect_stack in graph, I need to handle sandbox provisioning inside the graph (e.g. in a "Provision" node).

    // Let's simplify for this iteration:
    // 1. Clone & Detect Stack OUTSIDE graph (setup phase).
    // 2. Provision Sandbox.
    // 3. Run Graph (Start with Analyze -> Search -> Fix -> Verify).

    // Actually, `graph.ts` has `detectStackNode`. 
    // I will use the graph BUT I will pre-provision if possible, or lazy provision.
    // Let's use the `StackDetectorAgent` here directly to get the fingerprint, provision, then pass to graph.

    const { StackDetectorAgent } = await import('../agents/stack-detector');
    const detector = new StackDetectorAgent(process.env.GEMINI_API_KEY!);
    const fingerprint = await detector.detectStack(repoPath);
    logger.info(`Detected Stack: ${fingerprint.language}`);

    await sandbox.provision(
      `https://github.com/${owner}/${repo}.git`,
      fingerprint,
      options.useLocal ? repoPath : undefined
    );

    // Now run the graph.
    // Nodes: Analyze -> Search -> Fix -> Verify
    // (We skip detect_stack node in graph or remove it from graph definition? I'll leave it but maybe bypass?)
    // Actually, I'll allow the graph to re-detect or just pass fingerprint in state.
    // If fingerprint is in state, maybe detect node skips?

    const graph = createFixGraph();
    const initialState: AgentState = {
      issueUrl,
      repoPath,
      fingerprint,
      contextSnippets: [],
      testResults: [],
      attempts: 0,
      maxAttempts: options.maxAttempts,
      sandbox,
      dryRun: options.dryRun,
      status: 'running'
    };

    const finalState = await graph.invoke(initialState);

    await sandbox.cleanup();

    return {
      status: finalState.status === 'success' ? 'success' : 'failed',
      prUrl: finalState.prUrl,
      attempts: finalState.attempts,
      duration: Math.floor((Date.now() - startTime) / 1000),
      cost: 0, // TODO: track cost
    };

  } catch (error: any) {
    logger.error('Workflow failed:', error.message);
    if (sandbox) await sandbox.cleanup();
    return {
      status: 'failed',
      error: error.message,
      attempts: 0,
      duration: 0,
      cost: 0,
    };
  }
}

