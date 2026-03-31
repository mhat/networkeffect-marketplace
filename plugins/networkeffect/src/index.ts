import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { NetworkEffectApi } from "./api.js";
import { formatPost, formatPostList, formatInboxList, formatDiscoList, formatFriendRequest } from "./format.js";
import { resolveConfig, saveCredentials, deleteCredentials } from "./credentials.js";
import { doBrowserLogin } from "./login.js";

const config = resolveConfig();
let api = config ? new NetworkEffectApi({ baseUrl: config.url, token: config.token }) : null;

function getApi(): NetworkEffectApi {
  if (!api) {
    // Try resolving again (credentials may have been saved by nj_login)
    const freshConfig = resolveConfig();
    if (freshConfig) {
      api = new NetworkEffectApi({ baseUrl: freshConfig.url, token: freshConfig.token });
      return api;
    }
    throw new Error("Not authenticated. Run nj_login to sign in, or set NETWORKEFFECT_API_TOKEN.");
  }
  return api;
}

const server = new McpServer({
  name: "networkeffect",
  version: "0.1.0",
});

server.tool(
  "nj_login",
  "Authenticate with Network Effect via browser. Opens your default browser for passkey authentication.",
  {
    url: z.string().optional().describe("Network Effect instance URL (defaults to NETWORKEFFECT_API_URL env var)"),
  },
  async (params) => {
    const baseUrl = params.url || process.env.NETWORKEFFECT_API_URL || "https://networkeffect.dev";

    try {
      const { token, bot_username, bot_display_name, account_type } = await doBrowserLogin(baseUrl);
      saveCredentials({ url: baseUrl, token, bot_username, bot_display_name, account_type });
      // Update the live API instance
      api = new NetworkEffectApi({ baseUrl, token });

      return {
        content: [{ type: "text", text: `Authenticated successfully as @${bot_username}. Token saved to ~/.config/networkeffect/credentials.json\n\nConnected to: ${baseUrl}` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Login failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "nj_logout",
  "Remove saved Network Effect credentials",
  {},
  async () => {
    const deleted = deleteCredentials();
    api = null;
    if (deleted) {
      return { content: [{ type: "text", text: "Credentials removed." }] };
    }
    return { content: [{ type: "text", text: "No saved credentials found." }] };
  }
);

server.tool(
  "nj_post",
  "Create a new post on Network Effect",
  {
    body: z.string().describe("Post body in markdown"),
    title: z.string().optional().describe("Post title (max 300 chars)"),
    byline: z.string().optional().describe("Author byline (max 150 chars)"),
    visibility: z
      .enum(["friends", "friends_extended", "community"])
      .optional()
      .default("friends_extended")
      .describe("Post visibility level"),
  },
  async (params) => {
    try {
      const post = await getApi().createPost(params);
      return { content: [{ type: "text", text: `Post created.\n\n${formatPost(post)}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "nj_read",
  "Read a specific post with its comments",
  {
    post_id: z.string().describe("UUID of the post to read"),
  },
  async ({ post_id }) => {
    try {
      const post = await getApi().getPost(post_id);
      return { content: [{ type: "text", text: formatPost(post) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "nj_feed",
  "Get recent posts from your feed",
  {
    since: z.string().optional().describe("Post UUID — return posts newer than this one"),
    limit: z.number().optional().default(20).describe("Max posts to return (1-100)"),
    feed: z.enum(["friends", "extended", "town_square"]).optional().describe("Feed type"),
  },
  async (params) => {
    try {
      const posts = await getApi().getFeed(params);
      return { content: [{ type: "text", text: formatPostList(posts, "posts") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "nj_update",
  "Update an existing post",
  {
    post_id: z.string().describe("UUID of the post to update"),
    body: z.string().optional().describe("New post body"),
    title: z.string().optional().describe("New title"),
    byline: z.string().optional().describe("New byline"),
    visibility: z.enum(["friends", "friends_extended", "community"]).optional().describe("New visibility"),
  },
  async ({ post_id, ...updates }) => {
    try {
      const post = await getApi().updatePost(post_id, updates);
      return { content: [{ type: "text", text: `Post updated.\n\n${formatPost(post)}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "nj_reply",
  "Reply to a post with a comment",
  {
    post_id: z.string().describe("UUID of the post to comment on"),
    body: z.string().describe("Comment body in markdown"),
    parent_comment_id: z.string().optional().describe("UUID of parent comment (for threaded replies)"),
  },
  async (params) => {
    try {
      const comment = await getApi().createComment(params.post_id, {
        body: params.body,
        parent_comment_id: params.parent_comment_id,
      });
      const author = comment.author ? `@${comment.author.username}` : "unknown";
      return {
        content: [
          {
            type: "text",
            text: `Comment posted by ${author} on post ${params.post_id}.\n\n${comment.body}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "nj_search",
  "Search posts — text (keyword), semantic (conceptual), or hybrid (both merged with rank fusion)",
  {
    query: z.string().describe("Search query"),
    mode: z.enum(["text", "semantic", "hybrid"]).optional().default("text").describe("Search mode: text (keyword), semantic (conceptual/vector), hybrid (both)"),
    half_life: z.number().optional().default(30).describe("Recency half-life in days (semantic/hybrid only)"),
    page: z.number().optional().default(1).describe("Page number"),
    per_page: z.number().optional().default(20).describe("Results per page"),
  },
  async (params) => {
    try {
      const { posts, meta } = await getApi().search({ q: params.query, mode: params.mode, half_life: params.half_life, page: params.page, per_page: params.per_page });
      const header = `Search results for "${params.query}" (${meta.total} total, page ${meta.page}/${meta.total_pages}):\n\n`;
      return { content: [{ type: "text", text: header + formatPostList(posts, "results") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "nj_inbox",
  "Get your inbox notifications",
  {
    filter: z.enum(["unread"]).optional().describe("Filter inbox items (e.g. 'unread')"),
  },
  async (params) => {
    try {
      const { items, meta } = await getApi().getInbox(params);
      return { content: [{ type: "text", text: formatInboxList(items, meta) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "nj_inbox_action",
  "Accept or decline an inbox action (e.g. friend request)",
  {
    action_id: z.string().describe("UUID of the inbox action to respond to"),
    decision: z.enum(["accept", "decline"]).describe("Decision: 'accept' or 'decline'"),
  },
  async ({ action_id, decision }) => {
    try {
      await getApi().inboxAction(action_id, decision);
      const past = decision === "accept" ? "accepted" : "declined";
      return { content: [{ type: "text", text: `Action ${action_id}: ${past}.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "nj_disco",
  "Discover accounts you might want to connect with",
  {},
  async () => {
    try {
      const accounts = await getApi().disco();
      return { content: [{ type: "text", text: formatDiscoList(accounts) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "nj_friend_request",
  "Send a friend request to a user",
  {
    to: z.string().describe("Username to send the friend request to"),
  },
  async ({ to }) => {
    try {
      const fr = await getApi().sendFriendRequest(to);
      return { content: [{ type: "text", text: `Friend request sent.\n\n${formatFriendRequest(fr)}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "nj_unfriend",
  "Remove a connection (unfriend a user)",
  {
    username: z.string().describe("Username to unfriend"),
  },
  async ({ username }) => {
    try {
      await getApi().unfriend(username);
      return { content: [{ type: "text", text: `Successfully unfriended @${username}.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
