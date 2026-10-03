// The shapes the bridge answers with (bridge/lumen_ig_bridge/parse.py). Times
// are epoch milliseconds. Image links may be relative to the bridge (`/v1/m/…`);
// the client turns them into absolute URLs before the screens see them.

export type User = {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  verified: boolean;
};

export type Reel = {
  /** Instagram's media id (`<pk>_<owner pk>`), used for like, save, comments and share. */
  id: string;
  pk: string;
  code: string;
  user: User | null;
  caption: string;
  takenAt: number | null;
  /** Straight from Instagram's CDN, which allows playback from any origin. */
  videoUrl: string;
  /** The same video through the bridge, for when the CDN link fails. */
  videoProxyUrl: string | null;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  /** Null when the owner hides like counts. */
  likeCount: number | null;
  commentCount: number;
  liked: boolean;
  saved: boolean;
  commentsDisabled: boolean;
  audioTitle: string | null;
};

export type Page<T> = {items: T[]; nextCursor: string | null};

export type Comment = {
  id: string;
  user: User | null;
  text: string;
  createdAt: number | null;
  likeCount: number;
  replyCount: number;
};

export type CommentsPage = Page<Comment> & {commentCount: number | null; commentsDisabled: boolean};

export type Reaction = {emoji: string; count: number; mine: boolean};

/** A reel someone sent in a conversation. */
export type SharedReel = {
  code: string | null;
  /** Known when the message carries the whole reel. */
  id: string | null;
  thumbnailUrl: string | null;
  author: string | null;
  caption: string | null;
  /** The app can open it (it has a shortcode or a video). */
  playable: boolean;
};

export type MessageMedia = {imageUrl: string | null; videoUrl: string | null; videoProxyUrl: string | null};

export type MessageKind =
  | 'text'
  | 'like'
  | 'reel'
  | 'post'
  | 'voice'
  | 'photo'
  | 'video'
  | 'story'
  | 'ephemeral'
  | 'gif'
  | 'event'
  | 'unsupported';

export type Message = {
  id: string;
  senderId: string | null;
  /** The sender's username, for messages from others. */
  senderName?: string | null;
  fromMe: boolean;
  timestamp: number | null;
  kind: MessageKind;
  text: string;
  /** Instagram's item type, for messages the app can't show. */
  itemType?: string;
  reactions: Reaction[];
  replyTo: {id: string | null; text: string} | null;
  reel?: SharedReel;
  post?: MessageMedia & {code: string | null; author: string | null};
  voice?: {audioUrl: string; audioProxyUrl: string | null; durationSec: number | null};
  media?: MessageMedia;
  /** Sent from the glasses, not yet seen in a reload of the thread. */
  pending?: boolean;
};

export type Thread = {
  id: string;
  title: string;
  isGroup: boolean;
  users: User[];
  muted: boolean;
  unread: boolean;
  lastActivityAt: number | null;
  lastMessage: Message | null;
};

export type ThreadPage = {thread: Thread | null; messages: Message[]; olderCursor: string | null};
