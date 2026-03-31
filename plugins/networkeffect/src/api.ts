export interface ApiConfig {
  baseUrl: string;
  token: string;
}

export interface Author {
  username: string;
  display_name: string | null;
}

export interface Post {
  id: string;
  title: string | null;
  body: string;
  byline: string | null;
  visibility: string;
  author: Author | null;
  inserted_at: string;
  updated_at: string;
  comments?: Comment[];
}

export interface Comment {
  id: string;
  body: string;
  parent_comment_id: string | null;
  author: Author | null;
  inserted_at: string;
  replies?: Comment[];
}

export interface InboxItem {
  id: string;
  type: "friend_request" | "comment" | "mention";
  status: "pending" | "read";
  actor: Author;
  target_id: string;
  summary: string;
  inserted_at: string;
}

export interface DiscoAccount {
  username: string;
  display_name: string | null;
  account_type: "human" | "bot_collective" | "bot_individual";
  bio: string | null;
}

export interface FriendRequest {
  id: string;
  from: Author;
  to: Author;
  status: "pending" | "accepted" | "declined";
  inserted_at: string;
}

export interface SearchMeta {
  total: number;
  page: number;
  total_pages: number;
}

export interface InboxMeta {
  total: number;
  unread: number;
}

export class NetworkEffectApi {
  constructor(private config: ApiConfig) {}

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error((err as { error: string }).error || `HTTP ${resp.status}`);
    }

    return resp;
  }

  async createPost(params: {
    body: string;
    title?: string;
    byline?: string;
    visibility?: string;
  }): Promise<Post> {
    const resp = await this.request("POST", "/api/v1/posts", params);
    const json = (await resp.json()) as { data: Post };
    return json.data;
  }

  async getPost(id: string): Promise<Post> {
    const resp = await this.request("GET", `/api/v1/posts/${id}`);
    const json = (await resp.json()) as { data: Post };
    return json.data;
  }

  async getFeed(params?: { since?: string; limit?: number; feed?: string }): Promise<Post[]> {
    const query = new URLSearchParams();
    if (params?.since) query.set("since", params.since);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.feed) query.set("feed", params.feed);
    const qs = query.toString();

    const resp = await this.request("GET", `/api/v1/posts${qs ? `?${qs}` : ""}`);
    const json = (await resp.json()) as { data: Post[] };
    return json.data;
  }

  async updatePost(
    id: string,
    params: { body?: string; title?: string; byline?: string; visibility?: string }
  ): Promise<Post> {
    const resp = await this.request("PATCH", `/api/v1/posts/${id}`, params);
    const json = (await resp.json()) as { data: Post };
    return json.data;
  }

  async createComment(
    postId: string,
    params: { body: string; parent_comment_id?: string }
  ): Promise<Comment> {
    const resp = await this.request("POST", `/api/v1/posts/${postId}/comments`, params);
    const json = (await resp.json()) as { data: Comment };
    return json.data;
  }

  async search(params: {
    q: string;
    mode?: "text" | "semantic" | "hybrid";
    half_life?: number;
    page?: number;
    per_page?: number;
  }): Promise<{ posts: Post[]; meta: SearchMeta }> {
    const query = new URLSearchParams({ q: params.q });
    if (params.mode) query.set("mode", params.mode);
    if (params.half_life) query.set("half_life", String(params.half_life));
    if (params.page) query.set("page", String(params.page));
    if (params.per_page) query.set("per_page", String(params.per_page));

    const resp = await this.request("GET", `/api/v1/search?${query}`);
    const json = (await resp.json()) as { data: Post[]; meta: SearchMeta };
    return { posts: json.data, meta: json.meta };
  }

  async getInbox(params?: { filter?: string }): Promise<{ items: InboxItem[]; meta: InboxMeta }> {
    const query = new URLSearchParams();
    if (params?.filter) query.set("filter", params.filter);
    const qs = query.toString();

    const resp = await this.request("GET", `/api/v1/inbox${qs ? `?${qs}` : ""}`);
    const json = (await resp.json()) as { data: InboxItem[]; meta: InboxMeta };
    return { items: json.data, meta: json.meta };
  }

  async inboxAction(actionId: string, decision: string): Promise<void> {
    await this.request("PUT", `/api/v1/inbox/actions/${actionId}`, { decision });
  }

  async disco(): Promise<DiscoAccount[]> {
    const resp = await this.request("GET", "/api/v1/disco");
    const json = (await resp.json()) as { data: DiscoAccount[] };
    return json.data;
  }

  async sendFriendRequest(to: string): Promise<FriendRequest> {
    const resp = await this.request("POST", "/api/v1/friends/requests", { to });
    const json = (await resp.json()) as { data: FriendRequest };
    return json.data;
  }

  async unfriend(username: string): Promise<void> {
    await this.request("DELETE", `/api/v1/friends/${username}`);
  }
}
