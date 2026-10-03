import {useCallback, useEffect, useRef, useState} from 'react';
import type {Message} from '../api/types';

export type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export type AudioState = {
  /** Message the player belongs to; null before the first play. */
  id: string | null;
  status: AudioStatus;
  /** Seconds. */
  position: number;
  /** Seconds; from the media once known, otherwise from the message. */
  duration: number;
};

const IDLE: AudioState = {id: null, status: 'idle', position: 0, duration: 0};

/**
 * One voice message plays at a time, straight from Instagram's CDN (AAC in MP4),
 * or through the bridge when the CDN link fails. The player stops when the
 * conversation closes.
 */
export function useAudioPlayer(onError: (error: unknown) => void): [AudioState, (message: Message) => void] {
  const [state, setState] = useState<AudioState>(IDLE);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  /** The bridge's copy, tried once when the CDN link fails. */
  const fallbackRef = useRef<string | null>(null);

  const audio = useCallback(() => {
    if (audioRef.current == null) {
      const element = new Audio();
      element.preload = 'auto';
      const update = (patch: Partial<AudioState>) => setState(current => ({...current, ...patch}));
      element.addEventListener('timeupdate', () => update({position: element.currentTime}));
      element.addEventListener('durationchange', () => {
        if (Number.isFinite(element.duration) && element.duration > 0) {
          update({duration: element.duration});
        }
      });
      element.addEventListener('playing', () => update({status: 'playing'}));
      element.addEventListener('pause', () => {
        if (!element.ended) {
          // Only a playing message pauses; a pause while switching keeps the new one loading.
          setState(current => (current.status === 'playing' ? {...current, status: 'paused'} : current));
        }
      });
      element.addEventListener('ended', () => update({status: 'idle', position: 0}));
      element.addEventListener('error', () => {
        if (!element.getAttribute('src')) {
          return;
        }
        const fallback = fallbackRef.current;
        if (fallback) {
          fallbackRef.current = null;
          element.src = fallback;
          element.play().catch(() => setState(current => ({...current, status: 'paused'})));
          return;
        }
        update({status: 'error'});
        onErrorRef.current(new Error('decode'));
      });
      audioRef.current = element;
    }
    return audioRef.current;
  }, []);

  useEffect(
    () => () => {
      const element = audioRef.current;
      if (element) {
        element.pause();
        element.removeAttribute('src');
        element.load();
      }
    },
    [],
  );

  const toggle = useCallback(
    (message: Message) => {
      const voice = message.voice;
      if (!voice) {
        return;
      }
      const element = audio();
      const current = stateRef.current;
      if (current.id === message.id) {
        if (current.status === 'loading') {
          return;
        }
        if (current.status === 'playing') {
          element.pause();
          return;
        }
        if (current.status === 'paused' || (current.status === 'idle' && element.getAttribute('src'))) {
          element.play().catch(() => setState(next => ({...next, status: 'paused'})));
          return;
        }
      }
      element.pause();
      setState({id: message.id, status: 'loading', position: 0, duration: voice.durationSec ?? 0});
      fallbackRef.current = voice.audioProxyUrl;
      element.src = voice.audioUrl;
      element.currentTime = 0;
      // Without a fresh key press the engine may refuse to start; Enter then resumes.
      element.play().catch(() => setState(next => (next.status === 'error' ? next : {...next, status: 'paused'})));
    },
    [audio],
  );

  return [state, toggle];
}
