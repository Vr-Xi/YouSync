import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { db } from "./db/db.js";
// import { DatabaseError } from "pg";

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: {origin: "*"},
});
const SECRET = process.env.JWT_SECRET as string;


function l(log: string) {
    console.log(log);
};

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

async function dbUpdateMessageNumber(roomID: string, newNumber: number) {

    await db.query(
        `
        UPDATE rooms
        SET next_message_number = $2
        WHERE id = $1
        `,
        [roomID, newNumber]
    );
};

async function dbAddMessageLog(roomID: string, chatRecord: ChatMessage) {

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
        ORDER BY message_number ASC
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

async function dbFetchNextQueueItemNumber(roomID: string) {
    
    const data = await db.query(
        `
        SELECT * FROM rooms
        WHERE id = $1
        `,
        [roomID]
    );

    return data;
};

async function dbUpdateVideoNumber(roomID: string, newVideoNumber: number) {
    
    await db.query(
        `
        UPDATE rooms
        SET next_queue_item_number = $2
        WHERE id = $1
        `,
        [roomID, newVideoNumber]
    );
};

async function dbAddVideoItem(roomID: string, item: QueueItem) {

    await db.query(
        `
        INSERT INTO video_queue_items (
            id,
            room_id,
            queue_item_number,
            title,
            video_id,
            position
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
            item.id,
            roomID,
            item.queueItemNumber,
            item.title,
            item.videoID,
            item.position
        ]
    );
};

async function dbRemoveVideoItem(id: string) {

    await db.query(
        `
        DELETE FROM video_queue_items
        WHERE id = $1
        `,
        [id]
    );
};

async function dbUpdateVideoQueuePosition(item: QueueItem) {

    await db.query(
        `
        UPDATE video_queue_items
        SET position = $2
        WHERE id = $1
        `,
        [item.id, item.position]
    );

};

async function dbFetchVideoQueue(roomID: string) {

    const data = await db.query(
        `
        SELECT *
        FROM video_queue_items
        WHERE room_id = $1
        ORDER BY position ASC
        `,
        [roomID]
    );

    return data;
};

async function dbFetchVideoHistory(roomID: string) {

    const data = await db.query(
        `
        SELECT *
        FROM video_history_items
        WHERE room_id = $1
        ORDER BY position ASC
        `,
        [roomID]
    );

    return data;
};

async function dbAddVideoHistory(roomID: string, item: QueueItem) {

    await db.query(
        `
        INSERT INTO video_history_items (
            id,
            room_id,
            queue_item_number,
            title,
            video_id,
            position
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
            item.id,
            roomID,
            item.queueItemNumber,
            item.title,
            item.videoID,
            item.position
        ]
    );
};

async function dbUpdateLogNumber(roomID: string) {

    await db.query(
        `
        UPDATE rooms
        SET next_log_number = next_log_number + 1
        WHERE id = $1
        `,
        [roomID]
    );
};

async function dbFetchLogNumber(roomID: string) {
    
    const data = await db.query(
        `
        SELECT next_log_number
        FROM rooms
        WHERE id = $1
        `,
        [roomID]
    );

    return data;
};

async function dbAddLog(roomID: string, log: ActivityItem) {

    await db.query(
        `
        INSERT INTO event_logs (
            id,
            room_id,
            event_number,
            client_id,
            nickname,
            type,
            message,
            created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
        `,
        [
            log.id,
            roomID,
            log.eventNumber,
            log.clientID,
            log.nickname,
            log.type,
            log.message,
            log.createdAt
        ]
    );  
};

async function dbFetchLogs(roomID: string) {

    const data = await db.query(
        `
        SELECT *
        FROM event_logs
        WHERE room_id = $1
        `,
        [roomID]
    );

    return data;
};

async function dbClearLogs(roomID: string) {

    const data = await db.query(
        `
        DELETE FROM event_logs
        WHERE room_id = $1
        `,
        [roomID]
    );

    return data;
};

async function dbAddBan(roomID: string, clientID: string) {

    try {
        const data = await db.query(
            `
            INSERT INTO room_bans (
                room_id,
                client_id   
            )
            VALUES ($1, $2)
            `,
            [roomID, clientID]
        );

        return data;

    } catch {
        return;
    }
};

async function dbFetchBans(roomID: string) {

    const data = await db.query(
        `
        SELECT * 
        FROM room_bans
        WHERE room_id = $1
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
    clientIDToSockets: Map<string, Set<string>>,
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
    videoQueue: Array<QueueItem>,
    queueItemNumber: number,
    videoHistory: Array<QueueItem>,
    activityLog: Array<ActivityItem>,
    activityNumber: number,
    banList: Set<string>,
    roomLocked: boolean,
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

type QueueItem = {
    id: string,
    queueItemNumber: number,
    videoID: string,
    title: string,
    position: number,
};

type ActivityItem = {
    id: string,
    eventNumber: number,
    clientID: string | null,
    nickname: string | null,
    type: string,
    message: string,
    createdAt: number,
};

type EventPayload = {
    seekTo?: number,
    title?: string,
    nickname?: string,
};

const sessions: Map<string, Session> = new Map();
const socketToSession: Map<string, string> = new Map();
let hostReconnectGrace: NodeJS.Timeout;
const clientIDToSession: Map<string, string> = new Map();
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
            clientIDToSockets: new Map(),
            nicknames: new Map(),
            chat: [],
            chatMessageNumber: 1,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            nextUserNumber: 1,
            // videoID: "2H0r81kv5GA"
            // videoID: "zt3F7kRB5ik",
            // videoID: "8gKJ9mMPuIQ", // Jaiden
            // videoID: "YWeSTFCr94g",
            videoID: "",
            status: "unstarted",
            videoTime: 0,
            timeUpdatedAt: null,
            videoQueue: [],
            queueItemNumber: 1,
            videoHistory: [],
            activityLog: [],
            activityNumber: 1,
            banList: new Set(),
            roomLocked: false,
        };

        sessions.set(session.id, session);
        const chat = await dbFetchChat(session.id);
        session.chat = chat.rows.map((message) => {
            const fetchedMessage: ChatMessage = {
                id: message.id,
                messageNumber: message.message_number,
                createdAt: new Date(message.created_at).getTime(),
                clientID: message.client_id,
                nickname: message.nickname,
                message: message.message // lmao
            };

            return fetchedMessage;
        });

        const dbChatMessageNumber = (await dbFetchMessageNumber(session.id)).rows[0]?.next_message_number;
        if (dbChatMessageNumber) session.chatMessageNumber = dbChatMessageNumber;

        const dbNextQueueItemNumber = (await dbFetchNextQueueItemNumber(session.id)).rows[0]?.next_queue_item_number;
        if (dbNextQueueItemNumber) session.queueItemNumber = dbNextQueueItemNumber;
        // console.log(session.id, session.chatMessageNumber);

        const dbNextLogNumber = (await dbFetchLogNumber(session.id)).rows[0]?.next_log_number;
        if (dbNextLogNumber) session.activityNumber = dbNextLogNumber;

        const dbVideoQueue = await dbFetchVideoQueue(session.id);
        session.videoQueue = dbVideoQueue.rows.map((item) => {
            const fetchedItem: QueueItem = {
                id: item.id,
                queueItemNumber: item.queue_item_number,
                title: item.title,
                videoID: item.video_id,
                position: item.position,
            }

            return fetchedItem;
        });

        const dbVideoHistory = await dbFetchVideoHistory(session.id);
        session.videoHistory = dbVideoHistory.rows.map((item) => {
            const fetchedItem: QueueItem = {
                id: item.id,
                queueItemNumber: item.queue_item_number,
                title: item.title,
                videoID: item.video_id,
                position: item.position,
            }
            
            return fetchedItem;
        });

        const dbLogs = await dbFetchLogs(session.id);
        session.activityLog = dbLogs.rows.map((log) => {
            
            const fetchedLog: ActivityItem = {
                id: log.id,
                eventNumber: log.event_number,
                clientID: log.client_id,
                nickname: log.nickname,
                type: log.type,
                message: log.message,
                createdAt: log.created_at,
            };

            return fetchedLog;
        });

        const dbBans = await dbFetchBans(session.id);
        for (const row of dbBans.rows) {
            session.banList.add(row.client_id);
        }

        return session;
};

function issueSessionToken(clientID: string, sessionID: string, lifeID: string) {
    return jwt.sign({ clientID, sessionID, lifeID }, SECRET, { expiresIn: "24h" });
};

function issueLocalToken(clientID: string) {
    return jwt.sign({ clientID }, SECRET, { expiresIn: "24h" });
}

function getNewClientID(sessionID: string, localToken: string | null) {
    let clientID: string;
    let newLocalToken: string;

    if (localToken == null) {
        clientID = crypto.randomUUID();
        clientIDToSession.set(clientID, sessionID);
        newLocalToken = issueLocalToken(clientID);
    } else {
        try {
            const data = jwt.verify(localToken, SECRET) as { clientID: string };
            clientID = data.clientID;
            newLocalToken = localToken;
        } catch {
            clientID = crypto.randomUUID();
            clientIDToSession.set(clientID, sessionID);
            newLocalToken = issueLocalToken(clientID);
        }
    }

    

    return { clientID, newLocalToken };
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

        let candidate;

        // console.log("___________Crowning a new Host___________");

        for (const [ clientID, client ] of session.activeClients) {
            if (!candidate) {
                candidate = client;
            } else if (candidate.joinedAt > client.joinedAt) {
                candidate = client;
            }
        };
        
        // console.log("___________Long live the Host!___________");

        if (!candidate) return;
        session.host = candidate.id;
        emitToClientID(session, candidate.id, "become-host", {})
        logEvent(session, session.clients.get(session.host), "HOST_CHANGED", {});
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
        if ( sessions.get(data.sessionID)?.banList.has(data.clientID) ) return; // if banned, don't listen to a single command. this is here just in case there's some way to bypass all other ban restrictions. weird things are possible
        return data;
    } catch {
        return; // reject invalid tokens
    }

};

async function logEvent(session: Session, client: Client | undefined, action: string, payload: EventPayload) {
    if (!session) return;

    const log: ActivityItem = {
        id: `${session.id}-activity-${session.activityNumber}`,
        eventNumber: session.activityNumber,
        clientID: client?.id || null,
        nickname: client?.nickname || null,
        type: action,
        message: "",
        createdAt: Date.now(),
    };

    if (action === "PLAY") {
        log.message = `Video played by ${client?.nickname}.`;
    } else if (action === "PAUSE") {
        log.message = `Video paused by ${client?.nickname}.`;
    } else if (action === "SEEK") {
        log.message = `${client?.nickname} seeks to: ${payload.seekTo}`;
    } else if (action === "VIDEO_LOAD") {
        log.message = `Video loaded: ${payload.title}`;
    } else if (action === "VIDEO_QUEUE") {
        log.message = `Video added to queue: ${payload.title}`;
    } else if (action === "VIDEO_QUEUE_LOAD") {
        log.message = `Video loaded from queue: ${payload.title}`;
    // } else if (action === "VIDEO_HISTORY_LOAD") {
    //     log.message = `Video queued from history: ${payload.title}`;
    } else if (action === "NICKNAME_CHANGED") {
        log.message = `${client?.nickname} changed their nickname to: ${payload.nickname}`;
    } else if (action === "USER_JOINED") {
        log.message = `${client?.nickname} joined the room.`;
    } else if (action === "USER_LEFT") {
        log.message = `${client?.nickname} left the room.`;
    } else if (action === "USER_KICKED") {
        log.message = `${client?.nickname} was banned.`;
    } else if (action === "HOST_CHANGED") {
        log.message = `${client?.nickname} assumes hostship.`;
    } else if (action === "ROOM_LOCKED") {
        log.message = `Room locked.`;
    } else if (action === "ROOM_UNLOCKED") {
        log.message = `Room unlocked.`;
    } else {
        log.message = "Log failure."
    };

    session.activityLog.push(log);        
    io.to(session.id).emit("activity", log);
    

    session.activityNumber++;
    await dbUpdateLogNumber(session.id);
    await dbAddLog(session.id, log);
};

function addSocketToClientID(session: Session, clientID: string, socketID: string) {
    if (!session.clientIDToSockets.has(clientID)) session.clientIDToSockets.set(clientID, new Set());
    
    let sockets: Set<string> | undefined = session.clientIDToSockets.get(clientID);

    if (!sockets) {
        l("FATAL CLIENT ATTRIBUTION ERROR");
        return;
    }

    sockets.add(socketID);
} 

function emitToClientID(session: Session, clientID: string, emitType: string, payload: unknown) {
    const sockets: Set<string> | undefined = session.clientIDToSockets.get(clientID);
    if (!sockets) return;

    for (const socketID of sockets) {
        io.to(socketID).emit(emitType, payload);
    };
}   

function disconnectHelper(socketID: string): void {
    // used in both socket.on("disconnect") and socket.on("leave-session")
    const session = getSession(socketID);
    if (!session) return;

    // remove the leaving member from all connections to the session
    
    const clientID = session.socketToClientID.get(socketID);
    if (!clientID) return;
    const client = session.clients.get(clientID);
    if (!client) return;
    const sockets = session.clientIDToSockets.get(clientID);
    if (!sockets) return;

    // note: sockets need to be deleted more readily than clientIDs
    // clientIDs can be maintained over reload, while sockets cannot
    // actually.. maybe complete deletion isn't necessary. In fact I think I'll rule it that way, yeah

    session.socketToClientID.delete(socketID);
    sockets.delete(socketID);
    if (sockets.size === 0) {
        session.activeClients.delete(clientID);
        session.clientIDToSockets.delete(clientID);
    }
    socketToSession.delete(socketID);

    logEvent(session, client, "USER_LEFT", {});

    // delete when empty
    if (session.activeClients.size === 0) {
        if (session.deletionTimer) {
            clearTimeout(session.deletionTimer);
        };
        if (session.timeUpdatedAt) {
            session.videoTime += (Date.now() - session.timeUpdatedAt) / 1000;
            session.timeUpdatedAt = null;
        };


        session.deletionTimer = setTimeout(() => {
            if (session.activeClients.size === 0) {
                sessions.delete(session.id);
                // console.log("Session emptied -- deleting.")
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





// Sockets ------------------------------------------------------------------------------

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
    socket.on("join-session", async (sessionID: string, localToken: string, sessionToken: string) => {    
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

        let sessionData = verifyIdentity(sessionToken);
        let client: Client;
        let newLocalToken: string;
        let newSessionToken: string;

        if (!sessionData || sessionData.sessionID != session.id || sessionData.lifeID != session.lifeID) {
            // people who reload will have a token. new arrivals will be given one here
            // people who have a stale token will also land here, getting a new one
            // tokens can be stale if the tab is coming from another watchroom, or if the current watchroom was revived by activity
            const data = getNewClientID(session.id, localToken);
            const newClientID = data.clientID;
            newLocalToken = data.newLocalToken;


            newSessionToken = issueSessionToken(newClientID, session.id, session.lifeID);
            sessionData = verifyIdentity(newSessionToken);
            socket.emit("unbecome-host"); // sometimes necessary because browser navigation buttons do weird things
        } else {
            newLocalToken = localToken;
            newSessionToken = sessionToken;
        }

        const clientID = sessionData?.clientID;
        if (!clientID) {
            // emitToClientID(session, clientID, "session-invalid", {});
            // ^^^ WRONG.
            // This is an entry condition. The socket hasn't made it into clientIDtoSockets yet. So emitToClientIID will hit an empty set.
            socket.emit("session-invalid");
            return;
        }

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
            addSocketToClientID(session, clientID, socket.id);
            socket.emit("send-nickname", client.nickname);
        } else {
            if (session.roomLocked) {
                socket.emit("session-invalid");
                return;
            };


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
            addSocketToClientID(session, clientID, socket.id);
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
        socket.emit("auth-token", newLocalToken, newSessionToken);
        // socket.emit("load-order", session.videoID);

        logEvent(session, session.clients.get(clientID), "USER_JOINED", {})

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

        const session = getSession(socket.id);
        if (!session) return;

        const clientID = verifyIdentity(token)?.clientID;
        if (!clientID) return;
        
        const client = session.clients.get(clientID);
        if (!client) return;

        if (session.host != clientID) return;
        
        session.videoID = video;
        session.videoTime = 0;
        session.status = "unstarted";
        io.to(session.id).emit("load-order", session.videoID, session.status, session.videoTime, session.timeUpdatedAt);
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
    socket.on("change-host", (token: string, newHostID: string) => {
        if (!token) return;

        const session = getSession(socket.id);
        if (!session) return;

        const clientID = verifyIdentity(token)?.clientID;
        if (!clientID) return;

        if (session.host !== clientID) return;
        

        session.host = newHostID;
        io.to(session.id).emit("unbecome-host");
        emitToClientID(session, session.host, "become-host", {});

        logEvent(session, session.clients.get(session.host), "HOST_CHANGED", {});
    });

    //--
    socket.on("play-video", (time: number, date: number) => {
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

        // console.log(`${session.activityID}: ${client.nickname} emits a play order`);
        
        if (session.status === "playing") logEvent(session, client, "SEEK", {seekTo: time});
        else logEvent(session, client, "PLAY", {});

        session.status = "playing";
        session.videoTime = time;
        session.timeUpdatedAt = date;
        // console.log("time updated at: " + session.timeUpdatedAt);
        socket.to(sessionID).emit("video-play-order", time, session.timeUpdatedAt);

        roomUpdate(sessionID);
    });

    //--
    socket.on("pause-video", (time: number) => {
        const sessionID = socketToSession.get(socket.id);
        if (!sessionID) return;
        const session = sessions.get(sessionID);
        if (!session) return;

        
        const clientID = session.socketToClientID.get(socket.id);
        if (!clientID) return;
        const client = session.clients.get(clientID);
        if (!client) return;

        // marker
        if (session.status === "paused") logEvent(session, client, "SEEK", {seekTo: time});
        else logEvent(session, client, "PAUSE", {});

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
        
        // let time = session.videoTime;

        // if (session.timeUpdatedAt) time += (Date.now() - session.timeUpdatedAt) / 1000; // cool trick, but should be handled client-side, to cancel out communication delay
        // changed my mind on client-side handling, because it invariably causes skips.
        // so my options are, do you want delays, or do you want skips? damn it. I guess delays it is.
        socket.emit("send-time", session.status, session.videoTime, session.timeUpdatedAt);
    });

        //--
    socket.on("fetch-initial-time", () => {
        const session = getSession(socket.id);
        if (!session) return;

        
        // literally the same as fetch-time, but distinguished to trigger a different response
        socket.emit("send-initial-time", session.status, session.videoTime, session.timeUpdatedAt);
    });
    
    //--
    socket.on("request-sync-check", () => {
        // same as fetch-time, but targeting a different client-side function
        const session = getSession(socket.id);
        if (!session) return;

        // let time = session.videoTime;
        
        // if (session.timeUpdatedAt) time = session.videoTime + (Date.now() - session.timeUpdatedAt) / 1000;

        socket.emit("sync-check", session.status, session.videoTime, session.timeUpdatedAt);
    });

    //--
    socket.on("update-time", () => {
        const session = getSession(socket.id);
        if (!session) return;

        if (session.timeUpdatedAt) return;

        // console.log("update-time fired");

        session.status = "playing";
        session.timeUpdatedAt = Date.now();

        // handles an edge case, where a new arriver can't make play-emits, but the server needs to track the fact that the video was played anyway.
        // because what timestamp new arrivals should seek to is determined by math including timeUpdatedAt
    
        // after coming back to this later, I have no idea what the idea behind this was lmao
        // alright I removed it to see what happens and have concluded that it is ABSOLUTELY necessary yea
        // it was implemented badly though.
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

        logEvent(session, client, "NICKNAME_CHANGED", {nickname: nickname});
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
        
        dbUpdateMessageNumber(session.id, session.chatMessageNumber);
        dbAddMessageLog(session.id, chatRecord);
    });

    //--
    socket.on("fetch-chat-history", () => {
        const session = getSession(socket.id);
        if (!session) return;

        socket.emit("send-chat-history", session.chat);
    });

    //--
    // socket.on("read-db", async () => {
    //     await readDBMessages();
    // });

    //--
    socket.on("add-video-to-queue", async (videoID: string, title: string, token: string) => {
        const session = getSession(socket.id);
        if (!session) return;

        const data = verifyIdentity(token);
        if (!data) return;

        const client = session.clients.get(data.clientID);
        if (!client) return;

        if (data.clientID != session.host) return;



        // for (const item of session.videoQueue) {
        //     if (item.videoID === videoID) return;
        // };

        const item: QueueItem = {
            id: `${session.id}-video-${session.queueItemNumber}`,
            queueItemNumber: session.queueItemNumber,
            videoID,
            title,
            position: session.videoQueue.length + 1,
        };

        session.videoQueue.push(item);
        session.queueItemNumber++;
        io.to(session.id).emit("update-video-queue", item);

        logEvent(session, client, "VIDEO_QUEUE", {title: title});
    
        await dbUpdateVideoNumber(session.id, session.queueItemNumber);
        await dbAddVideoItem(session.id, item);
    });

    //--
    socket.on("fetch-video-queue", () => {
        const session = getSession(socket.id);
        if (!session) return;

        socket.emit("send-video-queue", session.videoQueue);
    });

    //--
    socket.on("load-from-queue", async (id: string, position: number, token: string) => {
        const session = getSession(socket.id);
        if (!session) return;

        const data = verifyIdentity(token);
        if (!data) return;

        const client = session.clients.get(data.clientID);
        if (!client) return

        if (client.id != session.host) return;

        const newVideoQueue: Array<QueueItem> = [];

        for (const item of session.videoQueue) {
            if (item.id !== id) {
                if (item.position > position) {
                    item.position--;

                    await dbUpdateVideoQueuePosition(item);
                }
                newVideoQueue.push(item);
            } else {

                session.videoID = item.videoID;
                session.status = "unstarted";
                item.position = session.videoHistory.length + 1;
                session.videoHistory.push(item);
                io.to(session.id).emit("load-order", item.videoID);
                io.to(session.id).emit("update-video-history", item);
            
                await dbRemoveVideoItem(item.id);
                await dbAddVideoHistory(session.id, item);
                
                logEvent(session, client, "VIDEO_QUEUE_LOAD", {title: item.title})
            }
        };

        session.videoQueue = newVideoQueue;
        
        io.to(session.id).emit("send-video-queue", session.videoQueue);

    });

    //--
    socket.on("add-video-to-history", async (videoID: string, title: string, token: string) => {
        const session = getSession(socket.id);
        if (!session) return;

        const data = verifyIdentity(token);
        if (!data) return;

        if (data.clientID != session.host) return;

        const client = session.clients.get(data.clientID);
        if (!client) return;

        // for (const item of session.videoQueue) {
        //     if (item.videoID === videoID) return;
        // };

        const item: QueueItem = {
            id: `${session.id}-video-${session.queueItemNumber}`,
            queueItemNumber: session.queueItemNumber,
            videoID,
            title,
            position: session.videoHistory.length + 1,
        };

        session.videoHistory.push(item);
        session.queueItemNumber++;

        io.to(session.id).emit("update-video-history", item);

        logEvent(session, client, "VIDEO_LOAD", {title: title});
        
        await dbAddVideoHistory(session.id, item);
        await dbUpdateVideoNumber(session.id, session.queueItemNumber);
    });


    //--
    socket.on("fetch-video-history", () => {
        const session = getSession(socket.id);
        if (!session) return;

        socket.emit("send-video-history", session.videoHistory);
    });

    //--
    socket.on("fetch-activity", () => {
        const session = getSession(socket.id);
        if (!session) return;

        socket.emit("send-activity", session.activityLog);
    });

    //--
    socket.on("set-room-lock", (locked: boolean, token: string) => {
        const session = getSession(socket.id);
        if (!session) return;

        const data = verifyIdentity(token);
        if (!data) return;

        const client = session.clients.get(data.clientID);
        if (!client) return;

        if (data.clientID != session.host) return;

        session.roomLocked = locked;
        io.to(session.id).emit("send-lock", session.roomLocked);
        
        if (locked) logEvent(session, client, "ROOM_LOCKED", {});
        else logEvent(session, client, "ROOM_UNLOCKED", {});
    });

    //--
    socket.on("fetch-lock-state", () => {
        const session = getSession(socket.id);
        if (!session) return;

        socket.emit("send-lock", session.roomLocked);
    });

    //--
    socket.on("fetch-client-id", () => {
        const session = getSession(socket.id);
        if (!session) return;
        const clientID = session.socketToClientID.get(socket.id);
        if (!clientID) return;
        const client = session.clients.get(clientID);
        if (!client) return;

        socket.emit("send-client-id", client.id);
    });

    //--
    socket.on("ban", async (sessionToken: string, target: string) => {
        const session = getSession(socket.id);
        if (!session) return;
        const data = verifyIdentity(sessionToken);
        if (!data) return;
        const clientID = data.clientID;
        if (!clientID) return;

        if (session.host != clientID) return;
        
        session.banList.add(target);
        emitToClientID(session, target, "session-invalid", {});
        
        dbAddBan(session.id, target);
    });

    //--
    socket.on("clear-logs-request", () => {
        const session = getSession(socket.id);
        if (!session) return;

        dbClearLogs(session.id);
        session.activityLog = [];
        io.to(session.id).emit("clear-logs-order");
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
});




server.listen(3001, () => {
    console.log("Server running on http://localhost:3001");
});