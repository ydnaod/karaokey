export type Role = 'host' | 'participant' | 'viewer';

export interface ParticipantSnapshot {
  displayName: string;
  role: Role;
}

export interface QueueItem {
  id: string;
  videoId: string;
  title: string;
  thumbnailUrl: string;
  addedBy: string;
  audioReady: boolean;
}

export interface NowPlaying {
  queueItemId: string;
  videoId: string;
  startedAt: number;
  pitchSemitones: number;
  paused: boolean;
  pausedAt: number | null;
}

export interface RoomState {
  code: string;
  myRole: Role;
  participants: ParticipantSnapshot[];
  queue: QueueItem[];
  nowPlaying: NowPlaying | null;
}
