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
    host: string | null,
    members: Map<string, Client>,
    memberToSocket: Map<string, string>,
    createdAt: number,
    lastActivity: number,
    nextUserNumber: number,
    deletionTimer?: NodeJS.Timeout,
    videoID: string,
    status: string,
    videoTime: number,
    timeUpdatedAt: number | null,
};

type Client = {
    id: string,
    nickname: string,
    role: string,
    joinedAt: number,
}

const sessions: Map<string, Session> = new Map();
const socketToSession: Map<string, string> = new Map();
let hostReconnectGrace: NodeJS.Timeout;

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

function getSession(socketID: string): Session | undefined {
    const sessionID = socketToSession.get(socketID);
    if (!sessionID) return;
    const session = sessions.get(sessionID);
    return session;
}

function chooseNewHost(sessionID: string) {
        const session = sessions.get(sessionID);
        if (!session) return;

        let candidateSocket;
        let candidate;

        // console.log("___________Crowning a new Host___________");

        for (const [ socketID, member ] of session.members) {
            if (!candidate) {
                candidateSocket = socketID;
                candidate = member;
            } else if (candidate.joinedAt > member.joinedAt) {
                    candidateSocket = socketID;
                    candidate = member;
            }
        };
        
        // console.log("___________Long live the Host!___________");

        
        if (!candidateSocket) return;
        if (!candidate) return;
        session.host = candidate.id;
        io.to(candidateSocket).emit("become-host");
}

function disconnectHelper(socketID: string): void {
    // used in both socket.on("disconnect") and socket.on("leave-session")
    const session = getSession(socketID);
    if (!session) return;

    // remove the leaving member from all connections to the session
    const member = session.members.get(socketID);
    if (!member) return;

    session.members.delete(socketID);
    session.memberToSocket.delete(member.id);
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
        
        
        // when the session host leaves, choose a new host
        if (member.id === session.host) {
            // console.log("is the host gone?");
            hostReconnectGrace = setTimeout(() => {
                // console.log("our host is gone! we need a new one!");
                chooseNewHost(session.id);
            }, 5_000);
        }
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
            host: null,
            members: new Map(),
            memberToSocket: new Map(),
            createdAt: Date.now(),
            lastActivity: Date.now(),
            nextUserNumber: 1,
            // videoID: "2H0r81kv5GA"
            videoID: "zt3F7kRB5ik",
            status: "paused",
            videoTime: 0,
            timeUpdatedAt: null,
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

        // if the session was about to close down, stop that
        if (session.deletionTimer) {
            clearTimeout(session.deletionTimer);
            // needs a new host, too. give it 1 second to set up the newcomer first
            setTimeout(() => {
                chooseNewHost(session.id);
            }, 1_000);
        }

        // if the user doesn't already have a nickname through sessionStorage, make a new nickname
        if (nickname === null) {
            nickname = `User ${session.nextUserNumber}`; // need to change this as well
            session.nextUserNumber++;
        }

        const client: Client = {
            id: clientID,
            nickname: nickname,
            role: "member",
            joinedAt: Date.now()
        }

        // host is only null at the very start, when the session creator comes in
        if (!session.host) {
            session.host = clientID;
        // if the host left, hostReconnectGrace gives them a short window to return
        } else if (hostReconnectGrace && session.host === clientID) {
            // console.log("we try to clear the timeout");
            clearTimeout(hostReconnectGrace);
        }
        session.members.set(socket.id, client);
        session.memberToSocket.set(client.id, socket.id);
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
    socket.on("load-request", (video: string, token: string) => {
        if (!token) return;

        let data;

        try {
            data = jwt.verify(token, SECRET) as { clientID: string };
        } catch {
            return;
        }
        
        const session = getSession(socket.id);
        if (!session) return;

        if (session.host != data.clientID) return;
        
        session.videoID = video;
        session.videoTime = 0;
        session.status = "paused";
        io.to(session.id).emit("load-order", session.videoID, session.status, session.videoTime);
    });    
    
    //--
    socket.on("fetch-video", () => {
        // console.log("video fetch arrived");
        const session = getSession(socket.id);
        if (!session) return;
        

        socket.emit("load-order", session.videoID);
        // console.log("video fetch succeeded");
    });    
    
    //--
    socket.on("check-hostship", (token: string) => {
        if (!token) return;

        let data;

        try {
            data = jwt.verify(token, SECRET) as { clientID: string };
        } catch {
            return;
        }

        const session = getSession(socket.id);
        if (!session) return;

        if (session.host === data.clientID) socket.emit("become-host");
    });
    
    //--
    socket.on("change-host", (token: string, clientID) => {
        if (!token) return;

        let data;

        try {
            data = jwt.verify(token, SECRET) as { clientID: string };
        } catch {
            return;
        }

        const session = getSession(socket.id);
        if (!session) return;

        if (session.host === data.clientID) {
            const newHostSocket: string | undefined = session.memberToSocket.get(clientID);
            if (!newHostSocket) return;
            session.host = clientID;
            io.to(newHostSocket).emit("become-host");
            socket.emit("unbecome-host");
        }
    });

    //--
    socket.on("play-video", (time: any) => {
        // console.log("___________ video data ___________");
        // console.log(typeof(time));
        // console.log(time);
        const sessionID = socketToSession.get(socket.id);
        if (!sessionID) return;
        const session = sessions.get(sessionID);
        if (!session) return;

        session.videoTime = time;
        session.timeUpdatedAt = Date.now();
        socket.to(sessionID).emit("video-play-order", time);
    });

    //--
    socket.on("pause-video", (time: any) => {
        const sessionID = socketToSession.get(socket.id);
        if (!sessionID) return;
        const session = sessions.get(sessionID);
        if (!session) return;

        session.status = "paused";
        session.videoTime = time;
        session.timeUpdatedAt = null;
        socket.to(sessionID).emit("video-pause-order", time);
    });

    //--
    socket.on("fetch-time", () => {
        const session = getSession(socket.id);
        if (!session) return;

        let time;

        if (!session.timeUpdatedAt) time = session.videoTime;
        else time = session.videoTime + (Date.now() - session.timeUpdatedAt) / 1000; // cool trick
        socket.emit("send-time", time, session.status);
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