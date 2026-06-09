import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { db } from "./db/db.js";

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: {origin: "*"},
});
const SECRET = process.env.JWT_SECRET as string;


// db -------------------------

// const result = await db.query("SELECT NOW()");
// console.log(result.rows[0]);

async function roomEntry(roomID: string) {
    await db.query(
        `
        INSERT INTO rooms (id)
        VALUES ($1)
        ON COnFLICT (id) DO UPDATE
        SET last_active_at = NOW()
        `,
        [roomID]
    );
};

async function roomUpdate(roomID: string) {
    await db.query(
        `
        UPDATE rooms
        SET last_active_at = NOW()
        WHERE id = $1
        `,
        [roomID]
    );
};

async function roomExists(roomID: string) {

    const data = await db.query(
        `
        SELECT 1
        FROM rooms
        WHERE id = $1
        `,
        [roomID]
    );

    return data.rows.length > 0;
};

async function updateMessageNumber(roomID: string, newNumber: number) {

    await db.query(
        `
        UPDATE rooms
        SET next_message_number = $2
        WHERE id = $1
        `,
        [roomID, newNumber]
    );
};

async function addMessageLog(roomID: string, chatRecord: ChatMessage) {

    await db.query(
        `
        INSERT INTO chat_messages (
            id,
            room_id,
            message_number,
            client_id,
            nickname,
            message
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
            chatRecord.id,
            roomID,
            chatRecord.messageNumber,
            chatRecord.clientID,
            chatRecord.nickname,
            chatRecord.message
        ]
    );
};

async function dbNicknameChange(roomID: string, clientID: string, nickname: string) {

    await db.query(
        `
        UPDATE chat_messages
        SET nickname = $3
        WHERE client_id = $2
        AND room_id = $1
        `,
        [roomID, clientID, nickname]
    );
};

async function dbFetchChat(roomID: string) {
    const data = await db.query(
        `
        SELECT * FROM chat_messages
        WHERE room_id = $1
        ORDER BY message_number
        `,
        [roomID]
    );

    return data;
};

async function dbFetchMessageNumber(roomID: string) {
    const data = await db.query(
        `
        SELECT * FROM rooms
        WHERE id = $1
        `,
        [roomID]
    );

    return data;
};

async function readDBMessages() {
    const data1 = await db.query(
        `
        SELECT * FROM chat_messages
        `
    );

    const data2 = new Map();

    for (const message of data1.rows) {
        if (data2.has(message.room_id)) {
            data2.set(message.room_id, data2.get(message.room_id) + 1);
        } else {
            data2.set(message.room_id, 1);
        }
    };

    console.log(data2);

    // for ( const [key, value] of data2 ) {
    //     await db.query(
    //         `
    //         UPDATE rooms
    //         SET next_message_number = $2
    //         WHERE id = $1
    //         `,
    //         [key, value + 1]
    //     );
    // };
}


// db end ---------------------


type Session = {
    id: string,
    lifeID: string,
    host: string | null,
    clients: Map<string, Client>,
    activeClients: Map<string, Client>, // almost the same as clients, but excluding people who left
    socketToClientID: Map<string, string>,
    clientIDToSocket: Map<string, string>,
    nicknames: Map<string, string>,
    chat: Array<ChatMessage>,
    chatMessageNumber: number,
    createdAt: number,
    lastActivity: number,
    nextUserNumber: number,
    deletionTimer?: NodeJS.Timeout,
    videoID: string,
    status: string,
    videoTime: number,
    timeUpdatedAt: number | null,
    actionID: number,
};

type Client = {
    id: string,
    nickname: string,
    role: string,
    joinedAt: number,
};

type ChatMessage = {
    id: string,
    messageNumber: number,
    createdAt: number,
    clientID: string,
    nickname: string,
    message: string,
};

const sessions: Map<string, Session> = new Map();
const socketToSession: Map<string, string> = new Map();
let hostReconnectGrace: NodeJS.Timeout;
// const reconnections: Map<string, NodeJS.Timeout> = new Map();

function generateID() {
    return Math.random().toString(36).substring(2, 10);
};

async function generateSessionId(): Promise<string> {

    let id = generateID();

    while ( sessions.has(id) || await roomExists(id) ) {
        id = generateID();
    };
    
    return id; 
};

async function createSession(sessionID: string) {
        const session: Session = {
            id: sessionID,
            lifeID: crypto.randomUUID(),
            host: null,
            clients: new Map(),
            activeClients: new Map(),
            socketToClientID: new Map(),
            clientIDToSocket: new Map(),
            nicknames: new Map(),
            chat: [],
            chatMessageNumber: 1,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            nextUserNumber: 1,
            // videoID: "2H0r81kv5GA"
            // videoID: "zt3F7kRB5ik",
            videoID: "8gKJ9mMPuIQ",
            status: "unstarted",
            videoTime: 0,
            timeUpdatedAt: null,
            actionID: 1,
        };

        sessions.set(session.id, session);
        const chat = await dbFetchChat(session.id);

        session.chat = chat.rows.map((message) => {
            const formattedMessage: ChatMessage = {
                id: message.id,
                messageNumber: message.message_number,
                createdAt: new Date(message.created_at).getTime(),
                clientID: message.client_id,
                nickname: message.nickname,
                message: message.message // lmao
            };

            return formattedMessage;
        });

        const dbChatMessageNumber = (await dbFetchMessageNumber(session.id)).rows[0]?.next_message_number;
        if (dbChatMessageNumber) session.chatMessageNumber = dbChatMessageNumber;

        console.log(session.id, session.chatMessageNumber);

        return session;
};

function issueToken(clientID: string, sessionID: string, lifeID: string) {
    return jwt.sign({ clientID, sessionID, lifeID }, SECRET, { expiresIn: "24h" });
};

function getNicknames(sessionID: string) {
    const session = sessions.get(sessionID);
    if (!session) return;

    const result: string[][] = [];

    for (const member of session.activeClients.values()) {
        result.push([member.id, member.nickname]);
    };

    return result;
};

function getSession(socketID: string): Session | undefined {
    const sessionID = socketToSession.get(socketID);
    if (!sessionID) return;
    const session = sessions.get(sessionID);
    return session;
};

function chooseNewHost(sessionID: string) {
        const session = sessions.get(sessionID);
        if (!session) return;

        let candidateSocket;
        let candidate;

        // console.log("___________Crowning a new Host___________");

        for (const [ clientID, client ] of session.activeClients) {
            if (!candidate) {
                candidateSocket = session.clientIDToSocket.get(clientID);
                candidate = client;
            } else if (candidate.joinedAt > client.joinedAt) {
                    candidateSocket = session.clientIDToSocket.get(clientID);
                    candidate = client;
            }
        };
        
        // console.log("___________Long live the Host!___________");

        
        if (!candidateSocket) return;
        if (!candidate) return;
        session.host = candidate.id;
        io.to(candidateSocket).emit("become-host");
};

function chooseNewNickname(sessionID: string) {
    const session = sessions.get(sessionID);
    if (!session) return;

    let newNickname;

    while (!newNickname || session.nicknames.has(newNickname)) {
        newNickname = `User ${session.nextUserNumber}`; // need to change this as well
        session.nextUserNumber++;
    };

    return newNickname;
};

function verifyIdentity(token: string) {
    try {
        const data = jwt.verify(token, SECRET) as { clientID: string, sessionID: string, lifeID: string };
        return data;
    } catch {
        return; // reject invalid tokens
    }

};


function disconnectHelper(socketID: string): void {
    // used in both socket.on("disconnect") and socket.on("leave-session")
    const session = getSession(socketID);
    if (!session) return;

    // remove the leaving member from all connections to the session
    
    const clientID = session.socketToClientID.get(socketID);
    if (!clientID) return;
    const client = session.clients.get(clientID);
    if (!client) return;


    // note: sockets need to be deleted more readily than clientIDs
    // clientIDs can be maintained over reload, while sockets cannot
    // actually.. maybe complete deletion isn't necessary. In fact I think I'll rule it that way, yeah

    session.activeClients.delete(clientID);
    session.socketToClientID.delete(socketID);
    session.clientIDToSocket.delete(clientID);
    socketToSession.delete(socketID);


    // delete when empty
    if (session.activeClients.size === 0) {
        if (session.deletionTimer) {
            clearTimeout(session.deletionTimer);
        };

        session.deletionTimer = setTimeout(() => {
            if (session.activeClients.size === 0) {
                sessions.delete(session.id);
                console.log("Session emptied -- deleting.")
            };
        }, 10_000);
    } else {
        // inform everyone that someone just left
        const nicknames = getNicknames(session.id);
        io.to(session.id).emit("send-members", nicknames);
        

        // when the session host leaves, choose a new host
        if (client.id === session.host) {
            // console.log("is the host gone?");
            hostReconnectGrace = setTimeout(() => {
                // console.log("our host is gone! we need a new one!");
                chooseNewHost(session.id);
            }, 5_000);
        };
    };
};


io.on("connection", (socket) => {
    // console.log("User connected:", socket.id);

    //--
    socket.on("create-session", async () => {
        let id = await generateSessionId();

        const session = await createSession(id);
        socket.emit("session-created", id);
        // console.log(`Created session ${id}`);

        roomEntry(session.id);
        //
    });

    //--
    socket.on("join-session", async (sessionID: string, inputToken: string) => {
        let session = sessions.get(sessionID);
        if (!session) {
            if (await roomExists(sessionID)) {
                session = await createSession(sessionID);
                await roomEntry(session.id);
            } else {
                socket.emit("session-invalid");
                return;
            }
        };

        let data = verifyIdentity(inputToken);
        let client: Client;
        let token;

        if (!data || data.sessionID != session.id || data.lifeID != session.lifeID) {
            // people who reload will have a token. new arrivals will be given one here
            const newClientID = crypto.randomUUID();
            token = issueToken(newClientID, session.id, session.lifeID);
            data = verifyIdentity(token);
            socket.emit("unbecome-host");
        } else {
            token = inputToken;
        }

        const clientID = data?.clientID;
        if (!clientID) return;

        // if the session was about to close down, stop that
        if (session.deletionTimer) {
            clearTimeout(session.deletionTimer);
            // needs a new host, too. give it 1 second to set up the newcomer first
            // kinda don't like doing it this way...
            setTimeout(() => {
                chooseNewHost(session.id);
            }, 1_000);
        };

        if (session.clients.has(clientID)) {
            const client = session.clients.get(clientID);
            if (!client) return;

            session.activeClients.set(clientID, client);
            session.socketToClientID.set(socket.id, clientID);
            session.clientIDToSocket.set(clientID, socket.id);
            socket.emit("send-nickname", client.nickname);
            console.log("Recognized as " + client.nickname);
        } else {
            const nickname = chooseNewNickname(sessionID);
            if (typeof(nickname) != "string") {
                // console.log("Nickname Generation Failure");
                return;
            };

            client = {
                id: clientID,
                nickname: nickname,
                role: "member",
                joinedAt: Date.now()
            };

            session.clients.set(clientID, client);
            session.activeClients.set(clientID, client);
            session.socketToClientID.set(socket.id, clientID);
            session.clientIDToSocket.set(clientID, socket.id);
            session.nicknames.set(nickname, clientID);
        };


        // host is only null at the very start, when the session creator comes in
        if (!session.host) {
            session.host = clientID;
        // if the host left, hostReconnectGrace gives them a short window to return
        } else if (hostReconnectGrace && session.host === clientID) {
            clearTimeout(hostReconnectGrace);
        };

        // socket.emit("session-info", {
        //     id: session.id,
        //     members: Array.from(session.nicknameMap.values()),
        // });

        socket.join(sessionID);
        socketToSession.set(socket.id, sessionID);
        session.lastActivity = Date.now();
        
        socket.emit("joined-session");
        socket.emit("auth-token", token);
        // socket.emit("load-order", session.videoID);

        await roomUpdate(session.id);
    });

    //--
    socket.on("fetch-members", () => {
        const session = getSession(socket.id);
        if (!session) return;
        
        const nicknames = getNicknames(session.id);
        io.to(session.id).emit("send-members", nicknames);

        const clientID = session.socketToClientID.get(socket.id);
        if (!clientID) return;

        const client = session.clients.get(clientID);
        if (!client) return;

        const nickname = client.nickname || "missing nickname";
        socket.emit("send-nickname", nickname);
    });

    //--
    socket.on("load-request", (video: string, token: string) => {
        if (!token) return;

        const clientID = verifyIdentity(token)?.clientID;
        if (!clientID) return;
        
        const session = getSession(socket.id);
        if (!session) return;

        if (session.host != clientID) return;
        
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

        const clientID = verifyIdentity(token)?.clientID;
        if (!clientID) return;

        const session = getSession(socket.id);
        if (!session) return;

        if (session.host === clientID) socket.emit("become-host");
    });
    
    //--
    socket.on("change-host", (token: string, newHostID) => {
        if (!token) return;

        const clientID = verifyIdentity(token)?.clientID;
        if (!clientID) return;

        const session = getSession(socket.id);
        if (!session) return;

        if (session.host === clientID) {
            const newHostSocket: string | undefined = session.clientIDToSocket.get(newHostID);
            if (!newHostSocket) return;
            session.host = newHostID;
            io.to(newHostSocket).emit("become-host");
            socket.emit("unbecome-host");
        };
    });

    //--
    socket.on("play-video", (time: any) => {
        // console.log("___________ video data ___________");
        const sessionID = socketToSession.get(socket.id);
        if (!sessionID) return;
        const session = sessions.get(sessionID);
        if (!session) return;

        // console.log("time updated at: " + session.timeUpdatedAt);

        const clientID = session.socketToClientID.get(socket.id);
        if (!clientID) return;
        const client = session.clients.get(clientID);
        if (!client) return;

        console.log(`${session.actionID}: ${client.nickname} emits a play order`);
        session.actionID++;

        session.status = "playing";
        session.videoTime = time;
        session.timeUpdatedAt = Date.now();
        // console.log("time updated at: " + session.timeUpdatedAt);
        socket.to(sessionID).emit("video-play-order", time);

        roomUpdate(sessionID);
    });

    //--
    socket.on("pause-video", (time: any) => {
        const sessionID = socketToSession.get(socket.id);
        if (!sessionID) return;
        const session = sessions.get(sessionID);
        if (!session) return;

        
        const clientID = session.socketToClientID.get(socket.id);
        if (!clientID) return;
        const client = session.clients.get(clientID);
        if (!client) return;

        console.log(`${session.actionID}: ${client.nickname} emits a pause order`);        
        session.actionID++;

        session.status = "paused";
        session.videoTime = time;
        session.timeUpdatedAt = null;
        socket.to(sessionID).emit("video-pause-order", time);

        roomUpdate(sessionID);
    });

    //--
    socket.on("fetch-time", () => {
        const session = getSession(socket.id);
        if (!session) return;
        

        // if (!session.timeUpdatedAt) time = session.videoTime;
        // else time = session.videoTime + (Date.now() - session.timeUpdatedAt) / 1000; // cool trick, but should be handled client-side, to cancel out communication delay
        socket.emit("send-time", session.status, session.videoTime, session.timeUpdatedAt);
    });
    
    //--
    socket.on("request-sync-check", () => {
        // same as fetch-time, but targeting a different client-side function
        const session = getSession(socket.id);
        if (!session) return;

        socket.emit("sync-check", session.status, session.videoTime, session.timeUpdatedAt);
    });

    //--
    socket.on("update-time", () => {
        const session = getSession(socket.id);
        if (!session) return;

        if (session.timeUpdatedAt) return;

        // console.log("update-time fired");
        session.timeUpdatedAt = Date.now();

        // handles an edge case, where a new arriver can't make play-emits, but the server needs to track the fact that the video was played anyway.
        // because what timestamp new arrivals should seek to is determined by math including timeUpdatedAt
    });

    //--
    socket.on("change-nickname", (nickname: string, token: string) => {
        const session = getSession(socket.id);
        if (!session) return;
        
        const clientID = verifyIdentity(token)?.clientID;
        if (!clientID) return;

        const client = session.clients.get(clientID);
        if (!client) return;

        if (session.nicknames.has(nickname)) return;

        const oldNickname = client.nickname;
        session.nicknames.delete(oldNickname);

        for (const message of session.chat) {
            if (message.clientID === clientID) message.nickname = nickname;
        };

        client.nickname = nickname;
        session.nicknames.set(nickname, clientID);
        
        const nicknames = getNicknames(session.id);
        io.to(session.id).emit("send-members", nicknames);
        socket.emit("send-nickname", nickname);
        io.to(session.id).emit("send-chat-history", session.chat);
    
        dbNicknameChange(session.id, clientID, nickname);
    });

    //--
    socket.on("send-chat-message", (chatMessage: string, token: string) => {
        const session = getSession(socket.id);
        if (!session) return;

        const clientID = verifyIdentity(token)?.clientID;
        if (!clientID) return;

        const client = session.clients.get(clientID);
        if (!client) return;

        const messageID = session.id + "-" + session.chatMessageNumber

        const chatRecord: ChatMessage = {
            id: messageID,
            messageNumber: session.chatMessageNumber,
            createdAt: Date.now(),
            clientID: clientID,
            nickname: client.nickname,
            message: chatMessage,
        };
        
        session.chat.push(chatRecord);
        session.chatMessageNumber++;

        // console.log("logging message #" + messageID);
        
        io.to(session.id).emit("chat-message", chatRecord);
        
        updateMessageNumber(session.id, session.chatMessageNumber);
        addMessageLog(session.id, chatRecord);
    });

    //--
    socket.on("fetch-chat-history", () => {
        const session = getSession(socket.id);
        if (!session) return;

        socket.emit("send-chat-history", session.chat);
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
        // console.log("User disconnected:", socket.id);
        disconnectHelper(socket.id);
    });


    //--
    socket.on("read-db", async () => {
        await readDBMessages();
    });
});




server.listen(3001, () => {
    console.log("Server running on http://localhost:3001");
});