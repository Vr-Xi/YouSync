import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import VideoPlayer from "../components/VideoPlayer.tsx";
import socket from "../socket.ts";

type ChatMessage = {
    id: number,
    createdAt: number,
    clientID: string,
    nickname: string,
    message: string,
};

function WatchRoom() {
    const { sessionID } = useParams<string>();
    const [ videoUrl, setVideoUrl ] = useState<string>("");
    const videoID = useRef<string>(""); // different from videoID in VideoPlayer.tsx! This one holds the ID extracted from the form, to be used only for changing
    const navigate = useNavigate();
    const [ memberList, setMembers ] = useState<[string, string][]>([]);
    const [ isHost, changeHostship ] = useState<boolean>(false);
    const [ nickname, changeNickname ] = useState<string>("");
    const [ pendingNickname, changePendingNickname ] = useState<string>("");
    const [ chatMessage, changeChatMessage ] = useState<string>("");
    const [ chat, updateChat ] = useState<ChatMessage[]>([]);

    const handleVideoSubmit = (e: any) => {
        e.preventDefault();
        videoID.current = extractVideoId(videoUrl);
        socket.emit("load-request", videoID.current, sessionStorage.getItem("token"));
    }

    const extractVideoId = (url: string) => {
        let result = url;
        if (url.startsWith("https://www.youtube.com/watch?v=")) {
            result = url.slice(32, url.length);
        }
        if (url.startsWith("www.youtube.com/watch?v=")) {
            result = url.slice(24, url.length);
        }
        if (url.startsWith("youtube.com/watch?v=")) {
            result = url.slice(20, url.length);
        }

        return result.split("&")[0]; // get rid of fragments
    }

    const handleMakeHost = (clientID: string) => {
        socket.emit("change-host", sessionStorage.getItem("token"), clientID);
    };

    const handleNicknameSubmit = (e: any) => {
        e.preventDefault();
        socket.emit("change-nickname", pendingNickname, sessionStorage.getItem("token"));
    }; 

    const handleChatMessage = (e: any) => {
        e.preventDefault();
        if (chatMessage === "") return;
        if (chatMessage.length > 100) return;
        console.log(chatMessage);
        socket.emit("send-chat-message", chatMessage, sessionStorage.getItem("token"));
        changeChatMessage("");
    };
    const readDB = () => {
        socket.emit("read-db");
    };

    useEffect(() => {

        // managing nickname persistence across page reload
        // const prevSessionID = sessionStorage.getItem("prevSessionID");
        // if (prevSessionID != sessionID) sessionStorage.clear();
        // sessionStorage.setItem("prevSessionID", sessionID);

        // const nickname = sessionStorage.getItem("nickname");
        //
        // if (!sessionStorage.getItem("clientID")) sessionStorage.setItem("clientID", crypto.randomUUID())
        // const clientID = sessionStorage.getItem("clientID");

        socket.emit("join-session", sessionID, sessionStorage.getItem("token"));

        socket.on("joined-session", () => {
            socket.emit("fetch-members");
            socket.emit("fetch-video");
            socket.emit("fetch-chat-history");
        });
        socket.on("session-invalid", () => {
            navigate("/", { state: { error: "You tried to access a session that does not exist.", show: 1} });
        })
        socket.on("send-members", (members) => {
            setMembers(members);
        })
        socket.on("send-nickname", (newNickname) => {
            changeNickname(newNickname);
            changePendingNickname(newNickname);
        })
        socket.on("auth-token", (token: string) => {
            sessionStorage.setItem("token", token);
            socket.emit("check-hostship", sessionStorage.getItem("token"));
        });
        socket.on("become-host", () => {
            changeHostship(true);
        })
        socket.on("unbecome-host", () => {
            changeHostship(false);
        });
        socket.on("send-chat-history", (chat) => {
            updateChat(chat);
        });
        socket.on("chat-message", (message: ChatMessage) => {
            updateChat((prev) => [...prev, message]);
        });


        return () => {
            // leave-session is needed so that in-page actions correctly trigger socket disconnect
            // example: using the "go to previous page" button in browser would usually NOT disconnect
            // but that would mess up my internal cleanup. so we do it manually here
            socket.emit("leave-session");

            socket.off("joined-session");
            socket.off("session-invalid");
            socket.off("send-members");
            socket.off("send-nickname");
            socket.off("auth-token");
            socket.off("become-host");
            socket.off("unbecome-host");
            socket.off("send-chat-history");
            socket.off("chat-message");
        };
    }, []);

    return (
        <div>
            <h1>Watch Room - Session ID: {sessionID} </h1>
            {isHost && <form onSubmit={handleVideoSubmit}>
                <input 
                    type="text" 
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="Paste YouTube link"
                />
                <button type="submit">Load Video</button>
            </form>}
            <VideoPlayer />
            <ul>
                {memberList.map((entry: [string, string]) => {
                    return (
                        <li 
                            key={entry[0]} 
                            style={{
                                backgroundColor: (entry[1] === nickname) ? "green" : "none",
                            }}
                        >
                            {entry[1]}
                            {(isHost && entry[1] != nickname) && <button onClick={() => handleMakeHost(entry[0])}>Make Host</button>}
                            {(isHost && entry[1] != nickname) && <button>Kick</button>}
                            {/* {isHost && <button onClick={() => handleMakeHost(entry[0])}>Make Host</button>} */}
                            {/* {isHost && <button>Kick</button>} */}
                        </li>
                    )
                })}
            </ul>
            <form onSubmit={handleNicknameSubmit}>
                <input 
                    type="text" 
                    value={pendingNickname}
                    onChange={(e) => changePendingNickname(e.target.value)}
                    placeholder="Change your nickname"
                />
                <button type="submit">Change Nickname</button>
            </form>
            <div style={{
                backgroundColor: "rgba(50,50,50,1)",
                width: "200px",
                height: "550px",
                justifySelf: "center",
            }}>
                <ul style={{
                    backgroundColor: "white",
                    width: "200px",
                    height: "450px",
                    overflowY: "auto",
                    overflowX: "hidden",
                }}>
                    {chat.map( (entry) => {
                        const entry_time = new Date(entry.createdAt).toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                        });
                        return (
                            <li key={entry.id}>{entry_time} {entry.nickname}: {entry.message}</li>
                        )
                    })}
                </ul>
                <form onSubmit={handleChatMessage}>
                    <input 
                        type="text"
                        value={chatMessage}
                        onChange={(e) => changeChatMessage(e.target.value)}
                        placeholder="Send a Chat message"
                    />
                    <button type="submit">Chat</button>
                </form>
            </div>
            <button onClick={readDB}>Secret button to fix the DB</button>
        </div>
    );
}

export default WatchRoom;