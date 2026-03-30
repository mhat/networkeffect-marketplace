import type { Post, Comment, Author, InboxItem, DiscoAccount, FriendRequest } from "./api.js";

function authorStr(author: Author | null): string {
  if (!author) return "unknown";
  return `**${author.display_name || author.username}** (@${author.username})`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPost(post: Post): string {
  const lines: string[] = [];

  if (post.title) lines.push(`# ${post.title}`);
  if (post.byline) lines.push(`*by ${post.byline}*`);
  lines.push(`${authorStr(post.author)} · ${formatDate(post.inserted_at)}`);
  if (post.updated_at !== post.inserted_at) {
    lines.push(`*(edited ${formatDate(post.updated_at)})*`);
  }
  lines.push(`Visibility: ${post.visibility}`);
  lines.push("");
  lines.push(post.body);

  if (post.comments && post.comments.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push(`## Comments (${post.comments.length})`);
    lines.push("");
    for (const comment of post.comments) {
      lines.push(formatComment(comment, 0));
    }
  }

  lines.push("");
  lines.push(`*Post ID: ${post.id}*`);

  return lines.join("\n");
}

export function formatComment(comment: Comment, depth: number): string {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  lines.push(
    `${indent}${authorStr(comment.author)} · ${formatDate(comment.inserted_at)} [comment:${comment.id}]`
  );
  lines.push(`${indent}${comment.body}`);

  if (comment.replies) {
    for (const reply of comment.replies) {
      lines.push(formatComment(reply, depth + 1));
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function formatPostSummary(post: Post): string {
  const title = post.title ? `**${post.title}**` : "*(untitled)*";
  const byline = post.byline ? ` by ${post.byline}` : "";
  const preview = post.body.length > 200 ? post.body.slice(0, 200) + "..." : post.body;
  const author = post.author ? `@${post.author.username}` : "unknown";

  return [
    `- ${title}${byline} — ${author} · ${formatDate(post.inserted_at)}`,
    `  ${preview}`,
    `  *ID: ${post.id}*`,
  ].join("\n");
}

export function formatPostList(posts: Post[], label: string): string {
  if (posts.length === 0) return `No ${label} found.`;
  return posts.map(formatPostSummary).join("\n\n");
}

export function formatInboxItem(item: InboxItem): string {
  const status = item.status === "pending" ? "[NEW]" : "[read]";
  const author = authorStr(item.actor);
  const date = formatDate(item.inserted_at);
  return `${status} ${item.type}: ${item.summary} — ${author} · ${date} *ID: ${item.id}*`;
}

export function formatInboxList(items: InboxItem[], meta: { total: number; unread: number }): string {
  if (items.length === 0) return "Inbox is empty.";
  const header = `Inbox: ${meta.total} total, ${meta.unread} unread`;
  return [header, "", ...items.map(formatInboxItem)].join("\n");
}

export function formatDiscoAccount(account: DiscoAccount): string {
  const name = account.display_name || account.username;
  const bio = account.bio ? ` — ${account.bio}` : "";
  return `**${name}** (@${account.username}) [${account.account_type}]${bio}`;
}

export function formatDiscoList(accounts: DiscoAccount[]): string {
  if (accounts.length === 0) return "No accounts to discover right now.";
  return ["Discover:", "", ...accounts.map(formatDiscoAccount)].join("\n");
}

export function formatFriendRequest(fr: FriendRequest): string {
  const lines: string[] = [];
  lines.push(`From: ${authorStr(fr.from)}`);
  lines.push(`To: ${authorStr(fr.to)}`);
  lines.push(`Status: ${fr.status}`);
  lines.push(`Date: ${formatDate(fr.inserted_at)}`);
  lines.push(`*ID: ${fr.id}*`);
  return lines.join("\n");
}
