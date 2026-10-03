import {describe, expect, it} from 'vitest';
import type {Message, Thread} from '../../src/api/types';
import {describeMessage, endsMessageRun, formatDuration, formatWait, initials, threadName, threadPreview} from '../../src/format';
import {allDictionaries, resolveLocale, translatePlural} from '../../src/i18n/strings';
import {matchThread} from '../../src/notifications';

function message(fields: Partial<Message>): Message {
  return {id: '1', senderId: '2', fromMe: false, timestamp: 0, kind: 'text', text: '', reactions: [], replyTo: null, ...fields};
}

function thread(fields: Partial<Thread>): Thread {
  return {id: 't', title: '', isGroup: false, users: [], muted: false, unread: false, lastActivityAt: null, lastMessage: null, ...fields};
}

const user = (username: string, fullName = '') => ({id: username, username, fullName, avatarUrl: null, verified: false});

describe('messages', () => {
  it('describes every kind', () => {
    expect(describeMessage(message({text: 'hi'}))).toBe('hi');
    expect(describeMessage(message({kind: 'reel', reel: {code: 'C', id: null, thumbnailUrl: null, author: 'maya', caption: null, playable: true}}))).toBe('Reel by maya');
    expect(describeMessage(message({kind: 'voice'}))).toBe('Voice message');
    expect(describeMessage(message({kind: 'post', text: 'Lunch', post: {code: null, author: 'joao', imageUrl: null, videoUrl: null, videoProxyUrl: null}}))).toBe(
      'Post by joao: Lunch',
    );
    expect(describeMessage(message({kind: 'unsupported'}))).toBe('Open Instagram to see this message');
  });

  it('previews the newest message with who sent it', () => {
    const group = thread({isGroup: true, title: 'Crew', lastMessage: message({text: 'Saturday?', senderName: 'joao.p'})});
    expect(threadPreview(group)).toBe('joao.p: Saturday?');
    expect(threadPreview(thread({lastMessage: message({text: 'ok', fromMe: true})}))).toBe('You: ok');
    expect(threadPreview(thread({}))).toBe('No messages yet');
    expect(threadName(thread({users: [user('a'), user('b')]}))).toBe('a, b');
  });

  it('groups runs by sender and five minutes', () => {
    const list = [message({id: 'a', timestamp: 0}), message({id: 'b', timestamp: 60000}), message({id: 'c', timestamp: 7 * 60000})];
    expect(endsMessageRun(list, 0)).toBe(false);
    expect(endsMessageRun(list, 1)).toBe(true);
    expect(endsMessageRun(list, 2)).toBe(true);
  });
});

describe('formatting', () => {
  it('formats durations, waits and initials', () => {
    expect(formatDuration(65.4)).toBe('1:05');
    expect(formatWait(300)).toBe('5 minutes');
    expect(formatWait(45)).toBe('45 seconds');
    expect(initials('maya.outdoors')).toBe('MO');
    expect(initials('Ana Costa')).toBe('AC');
  });

  it('picks Portuguese for pt-PT and pt-BR', () => {
    expect(resolveLocale(['pt-PT'])).toBe('pt');
    expect(resolveLocale(['pt-BR'])).toBe('pt');
    expect(resolveLocale(['de-DE'])).toBe('en');
    expect(translatePlural('pt', 'likesLabel', 1)).toBe('1 curtida');
    expect(translatePlural('en', 'likesLabel', 1200)).toBe('1.2K likes');
  });

  it('has the same strings in every language', () => {
    const [english, ...others] = Object.values(allDictionaries);
    for (const dictionary of others) {
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(english).sort());
    }
  });
});

describe('matchThread', () => {
  const threads = [
    thread({id: '1', title: 'ana.costa', users: [user('ana.costa', 'Ana Costa')]}),
    thread({id: '2', title: 'Climbing crew', isGroup: true, users: [user('joao.p')]}),
  ];

  it('finds a conversation by title, username or full name', () => {
    expect(matchThread(threads, 'ana.costa')?.id).toBe('1');
    expect(matchThread(threads, 'Ana Costa')?.id).toBe('1');
    expect(matchThread(threads, 'Climbing crew: joao.p')?.id).toBe('2');
    expect(matchThread(threads, 'someone else')).toBeNull();
    expect(matchThread(threads, '')).toBeNull();
  });
});
