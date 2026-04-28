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
};

const sessions: Map<string, Session> = new Map();

function generateSessionId(): string {
    return Math.random().toString(36).substring(2, 8);
}

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("create-session", () => {
        let id = generateSessionId();
        while (sessions.has(id)) {
            id = generateSessionId();
        }

        const session: Session = {
            id,
            owner: socket.id,
            members: new Set([socket.id]),
            createdAt: Date.now(),
            lastActivity: Date.now(),
            nicknameMap: new Map([[socket.id, "User 1"]]),
        };

        sessions.set(id,session);
        socket.emit("session-created", id);
        console.log(`Created session ${id}`);

    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });

});




server.listen(3001, () => {
    console.log("Server running on http://localhost:3001");
});