#!/usr/bin/env node

import { Command } from "commander";
import { getConvex } from "../utils/convexClient";
import { env } from "../utils/server-env";

const program = new Command();

program
  .name("task-runner-cli")
  .description("CLI for managing cmux tasks and environments")
  .version("1.0.0");

// Start command - can be used with or without a prompt
program
  .command("start")
  .description("Start a workspace environment")
  .option("--environment <envId>", "Environment ID to start")
  .option("--prompt <prompt>", "Task description (optional for untitled tasks)")
  .option("--team <teamSlugOrId>", "Team slug or ID", "cmux")
  .option("--untitled", "Start as untitled task (no prompt required)")
  .action(async (options) => {
    try {
      const convex = getConvex();
      
      // If untitled flag is set, use a default prompt
      const prompt = options.untitled ? "Untitled workspace - ready for task assignment" : options.prompt;
      
      if (!prompt && !options.untitled) {
        console.error("Error: Either --prompt or --untitled must be provided");
        process.exit(1);
      }

      console.log("Starting workspace environment...", {
        environment: options.environment,
        hasPrompt: Boolean(prompt),
        isUntitled: options.untitled,
        team: options.team
      });

      // Create a task run (use createUntitled for untitled tasks, create a task first for regular tasks)
      let taskRun;
      if (options.untitled) {
        taskRun = await convex.mutation(api.taskRuns.createUntitled, {
          teamSlugOrId: options.team,
          prompt,
          ...(options.environment && { environmentId: options.environment }),
          metadata: {
            isUntitled: true,
            startedVia: "cli"
          }
        });
      } else {
        // For regular tasks, create a task first, then create the run
        const taskId = await convex.mutation(api.tasks.create, {
          teamSlugOrId: options.team,
          text: prompt,
          description: `Task started via CLI: ${prompt}`,
          ...(options.environment && { environmentId: options.environment })
        });
        
        taskRun = await convex.mutation(api.taskRuns.create, {
          teamSlugOrId: options.team,
          taskId,
          prompt,
          ...(options.environment && { environmentId: options.environment })
        });
      }

      console.log("Task created:", taskRun.id);

      // Start the sandbox/environment
      const response = await fetch(`${env.WWW_ORIGIN}/api/sandboxes/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.CMUX_INTERNAL_API_KEY}`
        },
        body: JSON.stringify({
          teamSlugOrId: options.team,
          environmentId: options.environment,
          taskRunId: taskRun.id,
          taskRunJwt: taskRun.jwt,
          ttlSeconds: 60 * 60, // 1 hour default
          metadata: {
            isUntitled: options.untitled || false,
            startedVia: "cli"
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to start sandbox: ${error}`);
      }

      const sandbox = await response.json();
      
      console.log("Workspace started successfully!");
      console.log("Instance ID:", sandbox.instanceId);
      console.log("VS Code URL:", sandbox.vscodeUrl);
      console.log("Worker URL:", sandbox.workerUrl);
      
      if (options.untitled) {
        console.log("\n📝 Untitled workspace ready!");
        console.log("You can now attach a task to this workspace later.");
      }

    } catch (error) {
      console.error("Failed to start workspace:", error);
      process.exit(1);
    }
  });

// Agent command - requires a prompt
program
  .command("agent")
  .description("Start an agent task")
  .option("--environment <envId>", "Environment ID to start")
  .option("--prompt <prompt>", "Task description")
  .option("--agent <agent>", "Agent to use (e.g., claude/sonnet-4.5)")
  .option("--team <teamSlugOrId>", "Team slug or ID", "cmux")
  .action(async (options) => {
    try {
      if (!options.prompt) {
        console.error("Error: --prompt is required for agent tasks");
        process.exit(1);
      }

      const convex = getConvex();
      
      console.log("Starting agent task...", {
        environment: options.environment,
        prompt: options.prompt,
        agent: options.agent,
        team: options.team
      });

      // Create a task first, then create the task run with agent
      const taskId = await convex.mutation(api.tasks.create, {
        teamSlugOrId: options.team,
        text: options.prompt,
        description: `Agent task started via CLI: ${options.prompt}`,
        ...(options.environment && { environmentId: options.environment })
      });
      
      const taskRun = await convex.mutation(api.taskRuns.create, {
        teamSlugOrId: options.team,
        taskId,
        prompt: options.prompt,
        agentName: options.agent,
        ...(options.environment && { environmentId: options.environment })
      });

      console.log("Agent task created:", taskRun.id);

      // Start the sandbox/environment
      const response = await fetch(`${env.WWW_ORIGIN}/api/sandboxes/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.CMUX_INTERNAL_API_KEY}`
        },
        body: JSON.stringify({
          teamSlugOrId: options.team,
          environmentId: options.environment,
          taskRunId: taskRun.id,
          taskRunJwt: taskRun.jwt,
          ttlSeconds: 60 * 60,
          metadata: {
            isAgentTask: true,
            agent: options.agent,
            startedVia: "cli"
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to start sandbox: ${error}`);
      }

      const sandbox = await response.json();
      
      console.log("Agent workspace started successfully!");
      console.log("Instance ID:", sandbox.instanceId);
      console.log("VS Code URL:", sandbox.vscodeUrl);
      console.log("Worker URL:", sandbox.workerUrl);

    } catch (error) {
      console.error("Failed to start agent task:", error);
      process.exit(1);
    }
  });

// Exec command - run commands in existing instance
program
  .command("exec")
  .description("Execute commands in a running instance")
  .option("--instance <instanceId>", "Instance ID to execute in")
  .option("--command <command>", "Command to execute")
  .action(async (options) => {
    try {
      if (!options.instance || !options.command) {
        console.error("Error: Both --instance and --command are required");
        process.exit(1);
      }

      const { MorphCloudClient } = await import("morphcloud");
      const client = new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
      
      console.log("Executing command in instance:", options.instance);
      console.log("Command:", options.command);

      const instance = await client.instances.get({ instanceId: options.instance });
      const result = await instance.exec(options.command);

      console.log("Command executed:");
      console.log("Exit code:", result.exit_code);
      if (result.stdout) {
        console.log("STDOUT:", result.stdout);
      }
      if (result.stderr) {
        console.log("STDERR:", result.stderr);
      }

    } catch (error) {
      console.error("Failed to execute command:", error);
      process.exit(1);
    }
  });

program.parse();