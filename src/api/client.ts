// The bridge's HTTP API (bridge/README.md). The key goes in an Authorization
// header and nowhere else: never in a URL, a log line or an error message.
import type {Comment, CommentsPage, Message, Page, Reel, SharedReel, Thread, ThreadPage, User} from './types';

export type BridgeErrorCode =
  | 'bad_key'
  | 'login_required'
  | 'challenge'
  | 'blocked'
  | 'rate_limited'
  | 'not_found'
  | 'comments_disabled'
  | 'bad_request'
  | 'bad_audio'
  | 'too_large'
  | 'network'
  | 'timeout'
  | 'instagram';

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly status: number | null;
  /** Seconds, for `rate_limited`. */
  readonly retryAfter: number | null;

  constructor(code: BridgeErrorCode, status: number | null = null, retryAfter: number | null = null, message?: string) {
    super(message ?? `Bridge request failed: ${code}${status != null ? ` (HTTP ${status})` : ''}`);
    this.name = 'BridgeError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function asBridgeError(error: unknown): BridgeError {
  return error instanceof BridgeError ? error : new BridgeError('instagram', null, null, error instanceof Error ? error.message : String(error));
}

/** Errors that stop the whole app until something changes on the phone or on Instagram. */
export const SESSION_ERRORS: readonly BridgeErrorCode[] = ['bad_key', 'login_required', 'challenge'];

/** What the screens need from Instagram; the demo implements it too. */
export interface InstagramApi {
  me(): Promise<User>;
  reels(cursor?: string | null): Promise<Page<Reel>>;
  reelByCode(code: string): Promise<Reel>;
  setLiked(id: string, liked: boolean): Promise<void>;
  setSaved(id: string, saved: boolean): Promise<void>;
  markReelsSeen(ids: string[]): Promise<void>;
  comments(id: string, cursor?: string | null): Promise<CommentsPage>;
  shareReel(id: string, threadIds: string[]): Promise<void>;
  inbox(cursor?: string | null): Promise<Page<Thread>>;
  thread(id: string, cursor?: string | null): Promise<ThreadPage>;
  sendText(threadId: string, text: string): Promise<void>;
  /** A voice note (any audio the bridge's ffmpeg reads) and the input levels while recording. */
  sendVoice(threadId: string, audio: Blob, levels: number[]): Promise<void>;
  react(threadId: string, itemId: string, emoji: string, remove: boolean): Promise<void>;
  markSeen(threadId: string, itemId: string): Promise<void>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 90_000;

/** Absolute URL of a bridge link (`/v1/m/…`); absolute links stay as they are. */
export function resolveUrl(base: string, url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url, `${base}/`).toString();
  } catch {
    return null;
  }
}

function errorCode(value: unknown): BridgeErrorCode | null {
  const codes: BridgeErrorCode[] = [
    'bad_key', 'login_required', 'challenge', 'blocked', 'rate_limited', 'not_found', 'comments_disabled',
    'bad_request', 'bad_audio', 'too_large', 'network', 'instagram',
  ];
  return typeof value === 'string' && (codes as string[]).includes(value) ? (value as BridgeErrorCode) : null;
}

export class BridgeClient implements InstagramApi {
  readonly base: string;
  private readonly key: string;
  private readonly fetchImpl: FetchLike;

  constructor(base: string, key: string, fetchImpl: FetchLike = (input, init) => fetch(input, init)) {
    this.base = base.replace(/\/+$/, '');
    this.key = key;
    this.fetchImpl = fetchImpl;
  }

  private url(path: string, params: Record<string, string | null | undefined> = {}): string {
    const url = new URL(`${this.base}${path}`);
    for (const [name, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(name, value);
      }
    }
    return url.toString();
  }

  private async request<T>(path: string, init: RequestInit & {json?: unknown; params?: Record<string, string | null | undefined>} = {}): Promise<T> {
    const {json, params, ...rest} = init;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), rest.body instanceof FormData ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.key}`,
      // ngrok's free tunnels put a warning page in front of browser requests without it.
      'ngrok-skip-browser-warning': '1',
    };
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(path, params), {
        ...rest,
        body: json !== undefined ? JSON.stringify(json) : rest.body,
        headers,
        credentials: 'omit',
        signal: controller.signal,
      });
    } catch {
      throw new BridgeError(controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const error = body != null && typeof body === 'object' ? (body as {error?: {code?: unknown; retryAfter?: unknown}}).error : undefined;
      const code = errorCode(error?.code) ?? (response.status === 401 ? 'bad_key' : response.status === 429 ? 'rate_limited' : 'instagram');
      const retry = Number(error?.retryAfter ?? response.headers.get('retry-after'));
      throw new BridgeError(code, response.status, Number.isFinite(retry) && retry > 0 ? retry : null);
    }
    if (body == null) {
      // A tunnel's own page (HTML) instead of the bridge.
      throw new BridgeError('network', response.status);
    }
    return body as T;
  }

  private toLink(url: string | null | undefined): string | null {
    return resolveUrl(this.base, url);
  }

  private toUser(user: User | null | undefined): User | null {
    return user ? {...user, avatarUrl: this.toLink(user.avatarUrl)} : null;
  }

  private toReel(reel: Reel): Reel {
    return {
      ...reel,
      user: this.toUser(reel.user),
      videoUrl: this.toLink(reel.videoUrl) ?? reel.videoUrl,
      videoProxyUrl: this.toLink(reel.videoProxyUrl),
      posterUrl: this.toLink(reel.posterUrl),
    };
  }

  private toShared(reel: SharedReel | undefined): SharedReel | undefined {
    return reel ? {...reel, thumbnailUrl: this.toLink(reel.thumbnailUrl)} : undefined;
  }

  private toMessage(message: Message): Message {
    const media = (value: Message['media']) =>
      value ? {...value, imageUrl: this.toLink(value.imageUrl), videoUrl: this.toLink(value.videoUrl), videoProxyUrl: this.toLink(value.videoProxyUrl)} : undefined;
    return {
      ...message,
      reel: this.toShared(message.reel),
      post: message.post ? {...message.post, ...media(message.post)} : undefined,
      media: media(message.media),
      voice: message.voice
        ? {...message.voice, audioUrl: this.toLink(message.voice.audioUrl) ?? message.voice.audioUrl, audioProxyUrl: this.toLink(message.voice.audioProxyUrl)}
        : undefined,
    };
  }

  private toThread(thread: Thread): Thread {
    return {
      ...thread,
      users: thread.users.map(user => this.toUser(user)).filter((user): user is User => user != null),
      lastMessage: thread.lastMessage ? this.toMessage(thread.lastMessage) : null,
    };
  }

  async me(): Promise<User> {
    const {user} = await this.request<{user: User}>('/v1/me');
    return this.toUser(user) ?? user;
  }

  async reels(cursor?: string | null): Promise<Page<Reel>> {
    const page = await this.request<Page<Reel>>('/v1/reels', {params: {cursor}});
    return {items: page.items.map(reel => this.toReel(reel)), nextCursor: page.nextCursor};
  }

  async reelByCode(code: string): Promise<Reel> {
    const {reel} = await this.request<{reel: Reel}>(`/v1/reels/code/${encodeURIComponent(code)}`);
    return this.toReel(reel);
  }

  async setLiked(id: string, liked: boolean): Promise<void> {
    await this.request(`/v1/reels/${encodeURIComponent(id)}/like`, {method: liked ? 'POST' : 'DELETE'});
  }

  async setSaved(id: string, saved: boolean): Promise<void> {
    await this.request(`/v1/reels/${encodeURIComponent(id)}/save`, {method: saved ? 'POST' : 'DELETE'});
  }

  async markReelsSeen(ids: string[]): Promise<void> {
    await this.request('/v1/reels/seen', {method: 'POST', json: {ids}});
  }

  async comments(id: string, cursor?: string | null): Promise<CommentsPage> {
    const page = await this.request<CommentsPage>(`/v1/reels/${encodeURIComponent(id)}/comments`, {params: {cursor}});
    return {...page, items: page.items.map((comment: Comment) => ({...comment, user: this.toUser(comment.user)}))};
  }

  async shareReel(id: string, threadIds: string[]): Promise<void> {
    await this.request(`/v1/reels/${encodeURIComponent(id)}/share`, {method: 'POST', json: {threadIds}});
  }

  async inbox(cursor?: string | null): Promise<Page<Thread>> {
    const page = await this.request<Page<Thread>>('/v1/threads', {params: {cursor}});
    return {items: page.items.map(thread => this.toThread(thread)), nextCursor: page.nextCursor};
  }

  async thread(id: string, cursor?: string | null): Promise<ThreadPage> {
    const page = await this.request<ThreadPage>(`/v1/threads/${encodeURIComponent(id)}`, {params: {cursor}});
    return {
      thread: page.thread ? this.toThread(page.thread) : null,
      messages: page.messages.map(message => this.toMessage(message)),
      olderCursor: page.olderCursor,
    };
  }

  async sendText(threadId: string, text: string): Promise<void> {
    await this.request(`/v1/threads/${encodeURIComponent(threadId)}/text`, {method: 'POST', json: {text}});
  }

  async sendVoice(threadId: string, audio: Blob, levels: number[]): Promise<void> {
    const form = new FormData();
    const extension = audio.type.includes('ogg') ? 'ogg' : audio.type.includes('webm') ? 'webm' : 'audio';
    form.append('audio', audio, `voice.${extension}`);
    form.append('levels', JSON.stringify(levels.map(level => Math.round(level * 1000) / 1000)));
    await this.request(`/v1/threads/${encodeURIComponent(threadId)}/voice`, {method: 'POST', body: form});
  }

  async react(threadId: string, itemId: string, emoji: string, remove: boolean): Promise<void> {
    await this.request(`/v1/threads/${encodeURIComponent(threadId)}/items/${encodeURIComponent(itemId)}/reaction`, {
      method: 'POST',
      json: {emoji, remove},
    });
  }

  async markSeen(threadId: string, itemId: string): Promise<void> {
    await this.request(`/v1/threads/${encodeURIComponent(threadId)}/seen`, {method: 'POST', json: {itemId}});
  }
}
