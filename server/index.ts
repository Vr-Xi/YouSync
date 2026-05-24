import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import jwt from "jsonwebtoken";
import "dotenv/config";

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: {origin: "*"},
});
const SECRET = process.env.JWT_SECRET as string;

type Session = {
    id: string,
    owner: string | null,
    members: Map<string, Client>,
    createdAt: number,
    lastActivity: number,
    nextUserNumber: number,
    deletionTimer?: NodeJS.Timeout,
    videoID?: string,
};

type Client = {
    id: string,
    nickname: string,
    role: string,
    joinedAt?: number,
}

const sessions: Map<string, Session> = new Map();
const socketToSession: Map<string, string> = new Map();

function generateSessionId(): string {
    return Math.random().toString(36).substring(2, 8);
}

function issueToken(clientID: string ) {
    return jwt.sign({ clientID }, SECRET, { expiresIn: "24h" });
}

function getNicknames(sessionID: string) {
    const session = sessions.get(sessionID);
    if (!session) return;

    const result: string[][] = [];

    for (const member of session.members.values()) {
        result.push([member.id, member.nickname]);
    }

    return result;
}

function disconnectHelper(socketID: string): void {
    // used in both socket.on("disconnect") and socket.on("leave-session")
    const session = getSession(socketID);
    if (!session) return;

    // remove the leaving member from all connections to the session
    session.members.delete(socketID);
    socketToSession.delete(socketID);

    // delete when empty
    if (session.members.size === 0) {
        if (session.deletionTimer) {
            clearTimeout(session.deletionTimer);
        }

        session.deletionTimer = setTimeout(() => {
            if (session.members.size === 0) {
                sessions.delete(session.id);
                console.log("Session emptied -- deleting.")
            }
        }, 10_000);
    } else {
        // inform everyone that someone just left
        const nicknames = getNicknames(session.id);
        io.to(session.id).emit("send-members", nicknames);
    }
}

function getSession(socketID: string): Session | undefined {
    const sessionID = socketToSession.get(socketID);
    if (!sessionID) return;
    const session = sessions.get(sessionID);
    return session;
}


// io.use((socket, next) => {
//     const token = socket.handshake.auth?.token;
//     try {
//         const payload = jwt.verify(token, SECRET) as {
//             sessionID: string; CLIENTID: string; role: "owner"|"member";
//         };
//         socket.data = payload;
//         next();
//     } catch {
//         next(new Error("auth failed")); 
//     }
// });

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
            owner: null,
            members: new Map(),
            createdAt: Date.now(),
            lastActivity: Date.now(),
            nextUserNumber: 1,
            videoID: "2H0r81kv5GA"
        };

        sessions.set(id, session);
        socket.emit("session-created", id);
        console.log(`Created session ${id}`);

    });

    //--
    socket.on("join-session", (sessionID:string, clientID: string, nickname: string) => {
        const session = sessions.get(sessionID);
        if (!session) {
            socket.emit("session-invalid");
            return;
        }

        if (nickname === null) {
            nickname = `User ${session.nextUserNumber}`;
            session.nextUserNumber++;
        }

        const client: Client = {
            id: clientID,
            nickname: nickname,
            role: "member",
            joinedAt: Date.now()
        }

        if (!session.owner) session.owner = clientID;
        session.members.set(socket.id, client);
        session.lastActivity = Date.now();

        // socket.emit("session-info", {
        //     id: session.id,
        //     members: Array.from(session.nicknameMap.values()),
        // });


        // token handling
        const token = issueToken(clientID);
        socket.emit("auth-token", token);
        //

        socket.to(sessionID).emit("user-joined", {
            id: socket.id,
            nickname: getNicknames(sessionID)
        });

        socket.join(sessionID);
        socketToSession.set(socket.id, sessionID);
    });

    //--
    socket.on("fetch-members", () => {
        const session = getSession(socket.id);
        if (!session) return;
        
        const nicknames = getNicknames(session.id);
        io.to(session.id).emit("send-members", nicknames);
        const nickname = session.members.get(socket.id)?.nickname || "missing nickname";
        socket.emit("send-nickname", nickname);
    });

    //--
    socket.on("load-request", (video: string) => {
        const session = getSession(socket.id);
        if (!session) return;
        
        session.videoID = video;
        io.to(session.id).emit("load-order", session.videoID);
    });    
    
    //--
    socket.on("fetch-video", () => {
        // console.log("video fetch arrived");
        const session = getSession(socket.id);
        if (!session) return;
    
        socket.emit("load-order", session.videoID);
        // console.log("video fetch succeeded");
    });    //--

    socket.on("check-ownership", (token: string) => {
        if (!token) return;

        let data;

        try {
            data = jwt.verify(token, SECRET) as { clientID: string };
        } catch {
            return;
        }

        const session = getSession(socket.id);
        if (!session) return;

        if (session.owner === data.clientID) socket.emit("become-owner");
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
        const session = getSession(socket.id);
        if (!session) return;
        console.log("User disconnected:", socket.id);
        disconnectHelper(socket.id);
    });

});




server.listen(3001, () => {
    console.log("Server running on http://localhost:3001");
});