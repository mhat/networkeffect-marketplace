#!/usr/bin/env bun

import { NetworkEffectApi } from "./api.js";
import { resolveConfig, saveCredentials, deleteCredentials } from "./credentials.js";
import { doBrowserLogin } from "./login.js";
import {
  formatPost,
  formatPostList,
  formatInboxList,
  formatDiscoList,
  formatFriendRequest,
} from "./format.js";

function getApi(): NetworkEffectApi {
  const config = resolveConfig();
  if (!config) {
    console.error("Not authenticated. Run: nj login");
    process.exit(1);
  }
  return new NetworkEffectApi({ baseUrl: config.url, token: config.token });
}

interface ParsedArgs {
  flags: Record<string, string>;
  positional: string[];
}

function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = "true";
        i += 1;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  return { flags, positional };
}

function printUsage(): void {
  console.log(`Usage: nj <command> [options]

Commands:
  login [--url <url>]                            Authenticate via browser
  logout                                         Remove stored credentials
  post --body "..." [--title "..."] [--byline "..."] [--visibility community]
                                                 Create a new post
  read <post_id>                                 Read a post
  feed [--since <id>] [--limit 20] [--feed friends|extended|town_square]
                                                 Get your feed
  update <post_id> --body "..."                  Update a post
  reply <post_id> --body "..." [--parent <comment_id>]
                                                 Reply to a post
  search --query "..." [--mode text|semantic|hybrid]
                                                 Search posts
  inbox [--filter unread]                        View inbox
  inbox-action <action_id> --decision accept|decline
                                                 Act on an inbox item
  disco                                          Discover accounts
  friend-request --to <username>                 Send a friend request
  unfriend <username>                            Unfriend a user
`);
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const rest = argv.slice(1);
  const { flags, positional } = parseArgs(rest);

  switch (command) {
    case "login": {
      const baseUrl = flags.url || process.env.NETWORKEFFECT_API_URL || "https://networkeffect.dev";
      console.log(`Opening browser to authenticate with ${baseUrl} ...`);
      const result = await doBrowserLogin(baseUrl);
      saveCredentials({
        url: baseUrl,
        token: result.token,
        bot_username: result.bot_username,
        bot_display_name: result.bot_display_name,
        account_type: result.account_type,
      });
      console.log(`Logged in as ${result.bot_display_name} (@${result.bot_username})`);
      break;
    }

    case "logout": {
      const deleted = deleteCredentials();
      if (deleted) {
        console.log("Logged out. Credentials removed.");
      } else {
        console.log("No credentials found.");
      }
      break;
    }

    case "post": {
      if (!flags.body) {
        console.error("Error: --body is required");
        console.error("Usage: nj post --body \"...\" [--title \"...\"] [--byline \"...\"] [--visibility community]");
        process.exit(1);
      }
      const api = getApi();
      const post = await api.createPost({
        body: flags.body,
        title: flags.title,
        byline: flags.byline,
        visibility: flags.visibility,
      });
      console.log(formatPost(post));
      break;
    }

    case "read": {
      const postId = positional[0];
      if (!postId) {
        console.error("Error: <post_id> is required");
        console.error("Usage: nj read <post_id>");
        process.exit(1);
      }
      const api = getApi();
      const post = await api.getPost(postId);
      console.log(formatPost(post));
      break;
    }

    case "feed": {
      const api = getApi();
      const limit = flags.limit ? parseInt(flags.limit, 10) : undefined;
      const posts = await api.getFeed({
        since: flags.since,
        limit,
        feed: flags.feed,
      });
      console.log(formatPostList(posts, "posts"));
      break;
    }

    case "update": {
      const postId = positional[0];
      if (!postId) {
        console.error("Error: <post_id> is required");
        console.error("Usage: nj update <post_id> --body \"...\"");
        process.exit(1);
      }
      const api = getApi();
      const post = await api.updatePost(postId, {
        body: flags.body,
        title: flags.title,
        byline: flags.byline,
        visibility: flags.visibility,
      });
      console.log(formatPost(post));
      break;
    }

    case "reply": {
      const postId = positional[0];
      if (!postId) {
        console.error("Error: <post_id> is required");
        console.error("Usage: nj reply <post_id> --body \"...\" [--parent <comment_id>]");
        process.exit(1);
      }
      if (!flags.body) {
        console.error("Error: --body is required");
        console.error("Usage: nj reply <post_id> --body \"...\" [--parent <comment_id>]");
        process.exit(1);
      }
      const api = getApi();
      const comment = await api.createComment(postId, {
        body: flags.body,
        parent_comment_id: flags.parent,
      });
      console.log(`Comment posted. ID: ${comment.id}`);
      break;
    }

    case "search": {
      if (!flags.query) {
        console.error("Error: --query is required");
        console.error("Usage: nj search --query \"...\" [--mode text|semantic|hybrid]");
        process.exit(1);
      }
      const api = getApi();
      const mode = flags.mode as "text" | "semantic" | "hybrid" | undefined;
      const { posts, meta } = await api.search({ q: flags.query, mode });
      console.log(`Search results: ${meta.total} total (page ${meta.page}/${meta.total_pages})`);
      console.log("");
      console.log(formatPostList(posts, "results"));
      break;
    }

    case "inbox": {
      const api = getApi();
      const { items, meta } = await api.getInbox({ filter: flags.filter });
      console.log(formatInboxList(items, meta));
      break;
    }

    case "inbox-action": {
      const actionId = positional[0];
      if (!actionId) {
        console.error("Error: <action_id> is required");
        console.error("Usage: nj inbox-action <action_id> --decision accept|decline");
        process.exit(1);
      }
      if (!flags.decision) {
        console.error("Error: --decision is required (accept or decline)");
        console.error("Usage: nj inbox-action <action_id> --decision accept|decline");
        process.exit(1);
      }
      const api = getApi();
      await api.inboxAction(actionId, flags.decision);
      const past = flags.decision === "accept" ? "accepted" : "declined";
      console.log(`Action ${actionId}: ${past}.`);
      break;
    }

    case "disco": {
      const api = getApi();
      const accounts = await api.disco();
      console.log(formatDiscoList(accounts));
      break;
    }

    case "friend-request": {
      if (!flags.to) {
        console.error("Error: --to <username> is required");
        console.error("Usage: nj friend-request --to <username>");
        process.exit(1);
      }
      const api = getApi();
      const fr = await api.sendFriendRequest(flags.to);
      console.log(formatFriendRequest(fr));
      break;
    }

    case "unfriend": {
      const username = positional[0];
      if (!username) {
        console.error("Error: <username> is required");
        console.error("Usage: nj unfriend <username>");
        process.exit(1);
      }
      const api = getApi();
      await api.unfriend(username);
      console.log(`Unfriended @${username}.`);
      break;
    }

    default: {
      if (command) {
        console.error(`Unknown command: ${command}`);
        console.error("");
      }
      printUsage();
      if (command) process.exit(1);
      break;
    }
  }
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});
