import { useState, useEffect, useCallback, useRef } from 'react';
import { socket } from '../socket';
import type { RoomState, Role } from '../types';
type Identity = {
    roomCode: string;
    displayName: string;
    hostToken?: string;
};
export function useRoom() {
    const [room, setRoom] = useState<RoomState | null>(null);
    const [connected, setConnected] = useState(socket.connected);
    const [error, setError] = useState('');
    const identity = useRef<Identity | null>(null);
    useEffect(() => {
        const onConnect = () => { setConnected(true); setError(''); if (identity.current)
            socket.emit('room:join', identity.current); };
        const onDisconnect = () => { setConnected(false); };
        const onCreated = ({ roomCode, hostToken }: {
            roomCode: string;
            hostToken: string;
        }) => {
            localStorage.setItem(`karaokey:host:${roomCode}`, hostToken);
            identity.current = { roomCode, hostToken, displayName: localStorage.getItem('karaokey:name') || 'Host' };
        };
        const onJoined = ({ room: r, myRole }: {
            room: Omit<RoomState, 'myRole'>;
            myRole: Role;
        }) => {
            setRoom({ ...r, myRole });
            setError('');
            if (!identity.current)
                identity.current = { roomCode: r.code, displayName: localStorage.getItem('karaokey:name') || 'Host', hostToken: localStorage.getItem(`karaokey:host:${r.code}`) || undefined };
        };
        const onState = (r: Omit<RoomState, 'myRole'>) => setRoom(old => old && old.code === r.code ? { ...r, myRole: old.myRole } : old);
        const onRole = ({ newRole }: {
            newRole: Role;
        }) => setRoom(old => old ? { ...old, myRole: newRole } : old);
        const onError = ({ message }: {
            message: string;
        }) => setError(message);
        const refresh = () => socket.emit('room:sync');
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('room:created', onCreated);
        socket.on('room:joined', onJoined);
        socket.on('room:state', onState);
        socket.on('role:changed', onRole);
        socket.on('room:error', onError);
        socket.on('queue:refresh', refresh);
        return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('room:created', onCreated); socket.off('room:joined', onJoined); socket.off('room:state', onState); socket.off('role:changed', onRole); socket.off('room:error', onError); socket.off('queue:refresh', refresh); };
    }, []);
    const joinRoom = useCallback((roomCode: string, displayName: string, hostToken?: string) => {
        identity.current = { roomCode, displayName, hostToken };
        if (socket.connected)
            socket.emit('room:join', identity.current);
        else
            socket.connect();
    }, []);
    const leaveRoom = useCallback(() => { identity.current = null; socket.emit('room:leave'); socket.disconnect(); setRoom(null); }, []);
    return { room, joinRoom, leaveRoom, connected, error };
}
