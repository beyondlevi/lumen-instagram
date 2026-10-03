// Demo mode: fictional reels and conversations, no bridge, for screenshots and
// for trying the app without an Instagram session. Writes change the in-memory
// data, so likes, reactions and sent messages show up as they would for real.
import {BridgeError, type InstagramApi} from '../api/client';
import type {Comment, CommentsPage, Message, Page, Reel, Thread, ThreadPage, User} from '../api/types';
import marketPoster from './assets/market.webp';
import marketVideo from './assets/market.webm';
import ridgePoster from './assets/ridge.webp';
import ridgeVideo from './assets/ridge.webm';
import tulipsPoster from './assets/tulips.webp';
import tulipsVideo from './assets/tulips.webm';
import voiceNote from './assets/voice.ogg';

const MINUTE = 60_000;

function person(id: string, username: string, fullName: string): User {
  return {id, username, fullName, avatarUrl: null, verified: false};
}

const ME = person('1', 'levi', 'Levi');
const MAYA = person('11', 'maya.outdoors', 'Maya Lima');
const ANA = person('12', 'ana.costa', 'Ana Costa');
const JOAO = person('13', 'joao.p', 'Joao Pedro');
const BLOOM = person('14', 'studio.bloom', 'Studio Bloom');
const RAFA = person('15', 'rafa.m', 'Rafael M.');

function reel(id: string, code: string, user: User, caption: string, video: string, poster: string, likes: number | null, comments: number): Reel {
  return {
    id,
    pk: id.split('_')[0],
    code,
    user,
    caption,
    takenAt: Date.now() - 3 * 60 * MINUTE,
    videoUrl: video,
    videoProxyUrl: null,
    posterUrl: poster,
    width: 360,
    height: 640,
    durationSec: 6,
    likeCount: likes,
    commentCount: comments,
    liked: false,
    saved: false,
    commentsDisabled: false,
    audioTitle: null,
  };
}

function message(id: string, from: User, minutesAgo: number, fields: Partial<Message>): Message {
  return {
    id,
    senderId: from.id,
    senderName: from === ME ? null : from.username,
    fromMe: from === ME,
    timestamp: Date.now() - minutesAgo * MINUTE,
    kind: 'text',
    text: '',
    reactions: [],
    replyTo: null,
    ...fields,
  };
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function createDemoApi(): InstagramApi {
  const reels: Reel[] = [
    reel('3100_11', 'DMaya000001', MAYA, 'First snow on the ridge this morning. Worth the 5 am start.', ridgeVideo, ridgePoster, 12400, 86),
    reel('3101_14', 'DBloom00001', BLOOM, 'Tulip season at the flower market.', tulipsVideo, tulipsPoster, 3100, 41),
    reel('3102_13', 'DJoao000001', JOAO, 'Saturday market haul. Green beans for days.', marketVideo, marketPoster, null, 12),
  ];
  reels[1].audioTitle = 'Aurora · Spring';

  const comments: Record<string, Comment[]> = {
    '3100_11': [
      {id: 'c1', user: person('21', 'alex.lee', 'Alex Lee'), text: 'The light on that last ridge is unreal. Which trail is this?', createdAt: Date.now() - 60 * MINUTE, likeCount: 3, replyCount: 1},
      {id: 'c2', user: person('22', 'sam.rivera', 'Sam Rivera'), text: 'Saving this for next winter.', createdAt: Date.now() - 45 * MINUTE, likeCount: 0, replyCount: 0},
      {id: 'c3', user: MAYA, text: 'The north loop, about 6 km.', createdAt: Date.now() - 30 * MINUTE, likeCount: 2, replyCount: 0},
    ],
  };

  const anaMessages: Message[] = [
    message('m1', ANA, 70, {kind: 'reel', reel: {code: 'DBloom00001', id: null, thumbnailUrl: tulipsPoster, author: 'studio.bloom', caption: null, playable: true}}),
    message('m2', ANA, 69, {text: 'The place I told you about'}),
    message('m3', ME, 40, {text: 'Looks amazing. Saturday?', reactions: [{emoji: '❤️', count: 1, mine: false}]}),
    message('m4', ANA, 12, {kind: 'voice', voice: {audioUrl: voiceNote, audioProxyUrl: null, durationSec: 5}}),
  ];
  const threads: Thread[] = [
    {id: '9001', title: 'ana.costa', isGroup: false, users: [ANA], muted: false, unread: true, lastActivityAt: null, lastMessage: null},
    {id: '9002', title: 'Climbing crew', isGroup: true, users: [JOAO, ANA], muted: false, unread: true, lastActivityAt: null, lastMessage: null},
    {id: '9003', title: 'rafa.m', isGroup: false, users: [RAFA], muted: false, unread: false, lastActivityAt: null, lastMessage: null},
  ];
  const messages: Record<string, Message[]> = {
    '9001': anaMessages,
    '9002': [
      message('g1', ME, 200, {text: 'Who is in for Saturday?'}),
      message('g2', JOAO, 60, {text: 'Saturday, 7 am at the gate?'}),
    ],
    '9003': [
      message('r1', RAFA, 3 * 24 * 60, {text: 'Is this the one you meant?'}),
      message('r2', ME, 3 * 24 * 60 - 5, {text: 'haha that is the one'}),
    ],
  };
  let nextId = 100;

  const summary = (thread: Thread): Thread => {
    const list = messages[thread.id] ?? [];
    const last = list[list.length - 1] ?? null;
    return {...thread, lastMessage: last, lastActivityAt: last?.timestamp ?? null};
  };
  const findThread = (id: string) => {
    const thread = threads.find(candidate => candidate.id === id);
    if (!thread) throw new BridgeError('not_found', 404);
    return thread;
  };
  const findReel = (id: string) => {
    const found = reels.find(candidate => candidate.id === id);
    if (!found) throw new BridgeError('not_found', 404);
    return found;
  };
  const append = (threadId: string, fields: Partial<Message>) => {
    findThread(threadId);
    nextId += 1;
    (messages[threadId] ??= []).push(message(`s${nextId}`, ME, 0, fields));
  };

  return {
    async me() {
      await delay(150);
      return ME;
    },
    async reels(cursor) {
      await delay(300);
      return cursor ? {items: [], nextCursor: null} : {items: reels.map(item => ({...item})), nextCursor: 'demo-2'};
    },
    async reelByCode(code) {
      await delay(200);
      const found = reels.find(candidate => candidate.code === code);
      if (!found) throw new BridgeError('not_found', 404);
      return {...found};
    },
    async setLiked(id, liked) {
      await delay(150);
      const found = findReel(id);
      if (found.liked !== liked && found.likeCount != null) found.likeCount += liked ? 1 : -1;
      found.liked = liked;
    },
    async setSaved(id, saved) {
      await delay(150);
      findReel(id).saved = saved;
    },
    async markReelsSeen() {},
    async comments(id): Promise<CommentsPage> {
      await delay(250);
      const found = findReel(id);
      const list = comments[id] ?? [];
      return {items: list, nextCursor: null, commentCount: found.commentCount, commentsDisabled: found.commentsDisabled};
    },
    async shareReel(id, threadIds) {
      await delay(250);
      const found = findReel(id);
      for (const threadId of threadIds) {
        append(threadId, {kind: 'reel', reel: {code: found.code, id: found.id, thumbnailUrl: found.posterUrl, author: found.user?.username ?? null, caption: found.caption, playable: true}});
      }
    },
    async inbox(): Promise<Page<Thread>> {
      await delay(250);
      return {
        items: threads.map(summary).sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0)),
        nextCursor: null,
      };
    },
    async thread(id): Promise<ThreadPage> {
      await delay(200);
      const thread = findThread(id);
      return {thread: summary(thread), messages: (messages[id] ?? []).map(item => ({...item})), olderCursor: null};
    },
    async sendText(threadId, text) {
      await delay(300);
      append(threadId, {text});
    },
    async sendVoice(threadId, audio) {
      await delay(500);
      append(threadId, {kind: 'voice', voice: {audioUrl: URL.createObjectURL(audio), audioProxyUrl: null, durationSec: null}});
    },
    async react(threadId, itemId, emoji, remove) {
      await delay(150);
      const target = (messages[threadId] ?? []).find(item => item.id === itemId);
      if (!target) throw new BridgeError('not_found', 404);
      const others = target.reactions.filter(reaction => !reaction.mine);
      target.reactions = remove ? others : [...others, {emoji, count: 1, mine: true}];
    },
    async markSeen(threadId) {
      findThread(threadId).unread = false;
    },
  };
}
