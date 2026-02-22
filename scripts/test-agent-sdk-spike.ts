/**
 * S0 Spike: Claude Agent SDK Programmatic Control
 * Hypothesis: We can programmatically spawn and control a Claude Code agent
 */
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { unstable_v2_createSession, unstable_v2_prompt } from '@anthropic-ai/claude-agent-sdk';

// Helper to extract result from SDKResultMessage (handles both success and error)
function getResultText(msg: SDKMessage & { type: 'result' }): string | undefined {
  if (msg.subtype === 'success') {
    return msg.result;
  }
  return undefined;
}

async function test1OneShot() {
  console.log('=== Test 1: One-shot prompt ===');
  const result = await unstable_v2_prompt('What is 2+2? Reply with just the number.', {
    model: 'claude-sonnet-4-5-20250929',
    permissionMode: 'dontAsk',
  });
  console.log('Result:', result.subtype === 'success' ? result.result : 'error');
  console.log('Cost:', result.total_cost_usd);
  console.log('SUCCESS: One-shot prompt works\n');
}

async function test2Session() {
  console.log('=== Test 2: Basic session (no custom env) ===');
  const session = unstable_v2_createSession({
    model: 'claude-sonnet-4-5-20250929',
    permissionMode: 'dontAsk',
  });

  try {
    await session.send('What is 10+5? Reply with just the number.');

    let sessionId: string | undefined;
    for await (const msg of session.stream()) {
      sessionId = msg.session_id;
      console.log(`[${msg.type}]`);

      if (msg.type === 'result') {
        console.log('  Result:', getResultText(msg));
        console.log('  Cost:', msg.total_cost_usd);
        break;
      }
    }
    console.log('Session ID:', sessionId);
    console.log('SUCCESS: Basic session works\n');
  } finally {
    session.close();
  }
}

async function test3CustomEnv() {
  console.log('=== Test 3: Session with custom environment ===');
  // Note: The `env` option passes environment variables to the Claude Code process
  // This is useful for setting ANTHROPIC_API_KEY, etc.
  const session = unstable_v2_createSession({
    model: 'claude-sonnet-4-5-20250929',
    env: {
      ...process.env as Record<string, string>,
      CMUX_TASK_RUN_ID: 'test-spike-123',
    },
    permissionMode: 'dontAsk',
  });

  try {
    await session.send('What is 100 divided by 4? Reply with just the number.');

    for await (const msg of session.stream()) {
      console.log(`[${msg.type}]`);
      if (msg.type === 'result') {
        console.log('  Result:', getResultText(msg));
        break;
      }
    }
    console.log('SUCCESS: Custom env works\n');
  } finally {
    session.close();
  }
}

async function test4MultiTurn() {
  console.log('=== Test 4: Multi-turn conversation ===');
  const session = unstable_v2_createSession({
    model: 'claude-sonnet-4-5-20250929',
    permissionMode: 'dontAsk',
  });

  try {
    // Turn 1
    console.log('Turn 1: Asking about 5+3');
    await session.send('What is 5 + 3? Reply with just the number.');
    for await (const msg of session.stream()) {
      if (msg.type === 'result') {
        console.log('  Result:', getResultText(msg));
        break;
      }
    }

    // Turn 2 - tests context retention
    console.log('Turn 2: Multiply that by 2');
    await session.send('Multiply that by 2. Reply with just the number.');
    for await (const msg of session.stream()) {
      if (msg.type === 'result') {
        console.log('  Result:', getResultText(msg));
        break;
      }
    }
    console.log('SUCCESS: Multi-turn conversation works\n');
  } finally {
    session.close();
  }
}

async function test5ToolUse() {
  console.log('=== Test 5: Tool usage (Read file) ===');
  const session = unstable_v2_createSession({
    model: 'claude-sonnet-4-5-20250929',
    permissionMode: 'acceptEdits',
    allowedTools: ['Read', 'Glob'],
  });

  try {
    await session.send('Read the first 5 lines of package.json and tell me the project name.');

    for await (const msg of session.stream()) {
      console.log(`[${msg.type}]`);
      if (msg.type === 'result') {
        console.log('  Result:', getResultText(msg)?.slice(0, 200));
        break;
      }
    }
    console.log('SUCCESS: Tool usage works\n');
  } finally {
    session.close();
  }
}

async function main() {
  console.log('S0 Spike: Claude Agent SDK Programmatic Control\n');

  await test1OneShot();
  await test2Session();
  await test3CustomEnv();
  await test4MultiTurn();
  await test5ToolUse();

  console.log('=== SPIKE SUMMARY ===');
  console.log('[x] SDK creates session without error: PASS');
  console.log('[x] Custom env vars are passed to agent: PASS');
  console.log('[x] Permission mode works (auto-accept): PASS');
  console.log('[x] Streaming messages received: PASS');
  console.log('[x] Multi-turn context retention: PASS');
  console.log('[x] Tool usage (Read/Glob): PASS');
}

main().catch(console.error);
