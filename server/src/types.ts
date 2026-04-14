export type Role = 'host' | 'participant';

export interface Participant {
  socketId: string;
  displayName: string;
  role: Role;
  joinedAt: number;
}

export interface QueueItem {
  id: string;
  videoId: string;
  title: string;
  thumbnailUrl: string;
  addedBy: string;
  audioReady: boolean;
  audioFailed?: boolean;
}

export interface NowPlaying {
  queueItemId: string;
  videoId: string;
  startedAt: number;
  pitchSemitones: number;
  paused: boolean;
  pausedAt: number | null; // server timestamp when paused
}

export interface Room {
  code: string;
  hostSocketId: string;
  hostToken: string;
  // insertion-ordered map: socketId → Participant
  participants: Map<string, Participant>;
  queue: QueueItem[];
  nowPlaying: NowPlaying | null;
  createdAt: number;
  expiryTimeout: ReturnType<typeof setTimeout> | null;
}

// Wire-format snapshots (Maps serialised to arrays)
export interface ParticipantSnapshot {
  displayName: string;
  role: Role;
}

export interface RoomSnapshot {
  code: string;
  participants: ParticipantSnapshot[];
  queue: QueueItem[];
  nowPlaying: NowPlaying | null;
}
