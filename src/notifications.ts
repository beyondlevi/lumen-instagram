import type {Thread} from './api/types';

function normal(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase();
}

/**
 * The conversation an Instagram notification on the phone is about, from its
 * title: a thread title, a username or a full name. Instagram titles DMs with
 * the sender ("ana.costa") or "group: sender".
 */
export function matchThread(threads: Thread[], title: string): Thread | null {
  const wanted = normal(title);
  if (!wanted) {
    return null;
  }
  const candidates = [wanted, ...wanted.split(/[:·]/).map(part => part.trim()).filter(Boolean)];
  for (const candidate of candidates) {
    const found = threads.find(
      thread =>
        normal(thread.title) === candidate ||
        thread.users.some(user => normal(user.username) === candidate || (user.fullName && normal(user.fullName) === candidate)),
    );
    if (found) {
      return found;
    }
  }
  return null;
}
