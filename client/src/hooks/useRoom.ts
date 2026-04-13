import { useReducer, useEffect, useCallback } from 'react';
import { socket } from '../socket';
import type { RoomState, Role, ParticipantSnapshot, QueueItem, NowPlaying } from '../types';

type Action =
  | { type: 'JOINED'; room: Omit<RoomState, 'myRole'>; myRole: Role }
  | { type: 'PARTICIPANTS'; participants: ParticipantSnapshot[] }
  | { type: 'ROLE_CHANGED'; newRole: Role }
  | { type: 'QUEUE_UPDATED'; queue: QueueItem[] }
  | { type: 'AUDIO_READY'; videoId: string }
  | { type: 'PLAYER_STARTED'; nowPlaying: NowPlaying; queue: QueueItem[] }
  | { type: 'PLAYER_PAUSED' }
  | { type: 'PLAYER_RESUMED'; nowPlaying: NowPlaying }
  | { type: 'PITCH_CHANGED'; semitones: number }
  | { type: 'LEFT' };

function reducer(state: RoomState | null, action: Action): RoomState | null {
  if (action.type === 'JOINED') {
    return { ...action.room, myRole: action.myRole };
  }
  if (action.type === 'LEFT') return null;
  if (!state) return state;

  switch (action.type) {
    case 'PARTICIPANTS':
      return { ...state, participants: action.participants };
    case 'ROLE_CHANGED':
      return { ...state, myRole: action.newRole };
    case 'QUEUE_UPDATED':
      return { ...state, queue: action.queue };
    case 'AUDIO_READY':
      return {
        ...state,
        queue: state.queue.map((q) =>
          q.videoId === action.videoId ? { ...q, audioReady: true } : q
        ),
      };
    case 'PLAYER_STARTED':
      return { ...state, nowPlaying: action.nowPlaying, queue: action.queue };
    case 'PLAYER_PAUSED':
      return state.nowPlaying
        ? { ...state, nowPlaying: { ...state.nowPlaying, paused: true } }
        : state;
    case 'PLAYER_RESUMED':
      return { ...state, nowPlaying: action.nowPlaying };
    case 'PITCH_CHANGED':
      return state.nowPlaying
        ? { ...state, nowPlaying: { ...state.nowPlaying, pitchSemitones: action.semitones } }
        : state;
    default:
      return state;
  }
}

export function useRoom() {
  const [room, dispatch] = useReducer(reducer, null);

  useEffect(() => {
    const onJoined = ({ room: r, myRole }: { room: Omit<RoomState, 'myRole'>; myRole: Role }) =>
      dispatch({ type: 'JOINED', room: r, myRole });
    const onParticipants = ({ participants }: { participants: ParticipantSnapshot[] }) =>
      dispatch({ type: 'PARTICIPANTS', participants });
    const onRoleChanged = ({ newRole }: { newRole: Role }) =>
      dispatch({ type: 'ROLE_CHANGED', newRole });
    const onQueueUpdated = ({ queue }: { queue: QueueItem[] }) =>
      dispatch({ type: 'QUEUE_UPDATED', queue });
    const onAudioReady = ({ videoId }: { videoId: string }) =>
      dispatch({ type: 'AUDIO_READY', videoId });
    const onPlayerStarted = ({ nowPlaying, queue }: { nowPlaying: NowPlaying; queue: QueueItem[] }) =>
      dispatch({ type: 'PLAYER_STARTED', nowPlaying, queue });
    const onPlayerPaused = () =>
      dispatch({ type: 'PLAYER_PAUSED' });
    const onPlayerResumed = ({ nowPlaying }: { nowPlaying: NowPlaying }) =>
      dispatch({ type: 'PLAYER_RESUMED', nowPlaying });
    const onPitchChanged = ({ semitones }: { semitones: number }) =>
      dispatch({ type: 'PITCH_CHANGED', semitones });

    socket.on('room:joined', onJoined);
    socket.on('room:participants', onParticipants);
    socket.on('role:changed', onRoleChanged);
    socket.on('queue:updated', onQueueUpdated);
    socket.on('audio:ready', onAudioReady);
    socket.on('player:started', onPlayerStarted);
    socket.on('player:paused', onPlayerPaused);
    socket.on('player:resumed', onPlayerResumed);
    socket.on('pitch:changed', onPitchChanged);

    return () => {
      socket.off('room:joined', onJoined);
      socket.off('room:participants', onParticipants);
      socket.off('role:changed', onRoleChanged);
      socket.off('queue:updated', onQueueUpdated);
      socket.off('audio:ready', onAudioReady);
      socket.off('player:started', onPlayerStarted);
      socket.off('player:paused', onPlayerPaused);
      socket.off('player:resumed', onPlayerResumed);
      socket.off('pitch:changed', onPitchChanged);
    };
  }, []);

  const joinRoom = useCallback((roomCode: string, displayName: string) => {
    if (!socket.connected) socket.connect();
    socket.emit('room:join', { roomCode, displayName });
  }, []);

  const leaveRoom = useCallback(() => {
    socket.emit('room:leave');
    socket.disconnect();
    dispatch({ type: 'LEFT' });
  }, []);

  return { room, joinRoom, leaveRoom };
}
