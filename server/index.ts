import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: {origin: "*"},
});

type Session = {
    id: string;
    owner: string;
    members: Set<string>;
    createdAt: number;
    lastActivity: number;
    nicknameMap: Map<string, string>;
    nextUserNumber: number;
};

const sessions: Map<string, Session> = new Map();
const socketToSession: Map<string, string> = new Map();

function generateSessionId(): string {
    return Math.random().toString(36).substring(2, 8);
}

function disconnectHelper(socketID: string): void {
    // used in both socket.on("disconnect") and socket.on("leave-session")
    const sessionID = socketToSession.get(socketID);
    if (!sessionID) return;
    const session = sessions.get(sessionID);
    if (!session) return;

    // remove the leaving member from all connections to the session
    session.members.delete(socketID);
    session.nicknameMap.delete(socketID);
    socketToSession.delete(socketID);

    // delete when empty
    if (session.members.size === 0) {
        sessions.delete(sessionID);
    } else {
        // inform everyone that someone just left
        io.to(sessionID).emit("send-members", Array.from(session.nicknameMap.entries()));
    }
}

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    //--
    socket.on("create-session", () => {
        let id = generateSessionId();
        while (sessions.has(id)) {
            id = generateSessionId();
        }

        const session = {
            id,
            owner: socket.id,
            members: new Set([]),
            createdAt: Date.now(),
            lastActivity: Date.now(),
            nicknameMap: new Map(),
            nextUserNumber: 1,
        };

        sessions.set(id, session);
        socket.emit("session-created", id);
        console.log(`Created session ${id}`);

    });

    //--
    socket.on("join-session", (sessionID: string) => {
        const session = sessions.get(sessionID);
        if (!session) {
            socket.emit("session-invalid");
            return;
        }

        session.members.add(socket.id);
        session.lastActivity = Date.now();
        session.nicknameMap.set(socket.id, `User ${session.nextUserNumber}`);
        session.nextUserNumber++;

        socket.emit("session-info", {
            id: session.id,
            members: Array.from(session.nicknameMap.values()),
        });

        socket.to(sessionID).emit("user-joined", {
            id: socket.id,
            nickname: session.nicknameMap.get(socket.id),
        });

        socket.join(sessionID);
        socketToSession.set(socket.id, sessionID);
    });

    //--
    socket.on("fetch-members", () => {
        const sessionID = socketToSession.get(socket.id);
        if (!sessionID) return;
        const session = sessions.get(sessionID);
        if (!session) return;
        

        io.to(session.id).emit("send-members", Array.from(session.nicknameMap.entries()));
    });

    //--
    socket.on("leave-session", () => {
        // this exists because not all ways of leaving a session actually cause a disconnect event
        // for example, navigating to the previous page via the browser button will not fire a socket disconnect
        // leave-session relies on the useEffect cleanup in WatchRoom, which will reliably fire when we leave the page 
        disconnectHelper(socket.id);
    });


    //--
    socket.on("disconnect", () => {
        const sessionID = socketToSession.get(socket.id)
        if (!sessionID) return;
        const session = sessions.get(sessionID);
        if (!session) return;
        console.log("User disconnected:", socket.id);
        disconnectHelper(socket.id);
    });

});




server.listen(3001, () => {
    console.log("Server running on http://localhost:3001");
});