import type {Message, Thread, User} from './api/types';
import {formatCount, locale, t, tp, type Locale} from './i18n/strings';

/** Text shown for a message: the body, or a marker such as "Reel by maya". */
export function describeMessage(message: Message): string {
  switch (message.kind) {
    case 'text':
    case 'event':
      return message.text;
    case 'like':
      return message.text || t('markerLike');
    case 'reel':
      return message.reel?.author ? t('markerReelBy', {author: message.reel.author}) : t('markerReel');
    case 'post': {
      const marker = message.post?.author ? t('markerPostBy', {author: message.post.author}) : t('markerPost');
      return message.text ? t('markerWithCaption', {marker, caption: message.text}) : marker;
    }
    case 'voice':
      return t('markerVoice');
    case 'photo':
      return t('markerPhoto');
    case 'video':
      return t('markerVideo');
    case 'story':
      return message.text ? t('markerWithCaption', {marker: t('markerStory'), caption: message.text}) : t('markerStory');
    case 'ephemeral':
      return t('markerEphemeral');
    case 'gif':
      return t('markerGif');
    default:
      return t('markerUnsupported');
  }
}

/** Messages that read as a marker (secondary text) rather than as what someone wrote. */
export function isMarker(message: Message): boolean {
  return message.kind !== 'text' && message.kind !== 'like';
}

export function userName(user: User | null | undefined): string {
  return user?.username || user?.fullName || t('unknownContact');
}

export function threadName(thread: Pick<Thread, 'title' | 'users'> | null | undefined): string {
  return thread?.title || (thread?.users.length ? thread.users.map(user => user.username).join(', ') : t('unknownContact'));
}

/** The inbox row's preview: the newest message, with "You:" or the sender in groups. */
export function threadPreview(thread: Thread): string {
  const message = thread.lastMessage;
  if (!message) {
    return t('markerNoPreview');
  }
  const text = describeMessage(message);
  if (message.fromMe) {
    return t('senderPrefix', {sender: t('you'), text});
  }
  if (thread.isGroup && message.senderName) {
    return t('senderPrefix', {sender: message.senderName, text});
  }
  return text;
}

const SNIPPET_LENGTH = 24;

/** Short quote of a text, cut on a character boundary. */
export function snippet(text: string, length: number = SNIPPET_LENGTH): string {
  const chars = Array.from(text);
  return chars.length > length ? `${chars.slice(0, length - 1).join('').trimEnd()}…` : text;
}

/** "0:09", "1:05": a duration or position in minutes and seconds. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** A wait in words: "45 seconds", "5 minutes". */
export function formatWait(seconds: number): string {
  return seconds < 90 ? tp('durationSeconds', Math.max(1, Math.round(seconds))) : tp('durationMinutes', Math.round(seconds / 60));
}

export function initials(name: string): string {
  const letters = name
    .replace(/[^\p{L}\p{N}\s._]/gu, '')
    .split(/[\s._]+/)
    .filter(Boolean)
    .map(part => Array.from(part)[0] ?? '')
    .join('');
  return Array.from(letters).slice(0, 2).join('').toUpperCase();
}

export function likeCountText(count: number | null): string | undefined {
  return count == null ? undefined : formatCount(count);
}

type DateFormats = {time: Intl.DateTimeFormat; weekday: Intl.DateTimeFormat; date: Intl.DateTimeFormat};
const dateFormats = new Map<Locale, DateFormats>();

function formats(): DateFormats {
  let current = dateFormats.get(locale);
  if (current == null) {
    current = {
      time: new Intl.DateTimeFormat(locale, {hour: '2-digit', minute: '2-digit'}),
      weekday: new Intl.DateTimeFormat(locale, {weekday: 'short'}),
      date: new Intl.DateTimeFormat(locale, {day: '2-digit', month: '2-digit'}),
    };
    dateFormats.set(locale, current);
  }
  return current;
}

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** One representation per row: time today, "Yesterday", weekday this week, else day/month. */
export function formatListTime(ms: number | null, now: number = Date.now()): string | undefined {
  if (ms == null) {
    return undefined;
  }
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / 86400000);
  const {time, weekday, date} = formats();
  if (days <= 0) {
    return time.format(ms);
  }
  if (days === 1) {
    return t('yesterday');
  }
  if (days < 7) {
    return weekday.format(ms);
  }
  return date.format(ms);
}

export function formatBubbleTime(ms: number | null, now: number = Date.now()): string {
  if (ms == null) {
    return '';
  }
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / 86400000);
  const {time: timeFormat, weekday, date} = formats();
  const time = timeFormat.format(ms);
  if (days <= 0) {
    return time;
  }
  const day = days === 1 ? t('yesterday') : days < 7 ? weekday.format(ms) : date.format(ms);
  return `${day} ${time}`;
}

/** Messages from the same sender within five minutes share one timestamp. */
export function endsMessageRun(messages: Message[], index: number): boolean {
  const current = messages[index];
  const next = messages[index + 1];
  if (!next) {
    return true;
  }
  return (
    next.fromMe !== current.fromMe ||
    next.senderId !== current.senderId ||
    (next.timestamp ?? 0) - (current.timestamp ?? 0) > 5 * 60000
  );
}

export function startsMessageRun(messages: Message[], index: number): boolean {
  return index === 0 || endsMessageRun(messages, index - 1);
}
