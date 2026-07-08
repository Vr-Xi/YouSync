import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import VideoPlayer from "../components/VideoPlayer.tsx";
import socket from "../socket.ts";
import styles from "./WatchRoom.module.css";

type ChatMessage = {
    id: number,
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

function WatchRoom() {
    const { sessionID } = useParams<string>();
    const [ videoInput, setVideoInput ] = useState<string>("");
    const videoID = useRef<string>(""); // different from videoID in VideoPlayer.tsx! This one holds the ID extracted from the form, to be used only for changing
    const navigate = useNavigate();
    const [ memberList, setMembers ] = useState<[string, string][]>([]);
    const [ isHost, changeHostship ] = useState<boolean>(false);
    const [ nickname, changeNickname ] = useState<string>("");
    const [ pendingNickname, changePendingNickname ] = useState<string>("");
    const [ chatMessage, changeChatMessage ] = useState<string>("");
    const [ chat, updateChat ] = useState<ChatMessage[]>([]);
    const [ videoQueue, updateVideoQueue ] = useState<QueueItem[]>([]);
    const [ videoHistory, updateVideoHistory ] = useState<QueueItem[]>([]);
    const [ activityLog, updateActivityLog ] = useState<ActivityItem[]>([]);
    const [ roomLocked, setRoomLocked ] = useState<boolean>(false);
    const localToken = useRef<string | null>(localStorage.getItem("yousync-localToken"));
    const sessionToken = useRef<string | null>(sessionStorage.getItem("yousync-sessionToken"));
    const clientID = useRef<string | null>(null);
    const [ banOverlay, setBanOverlay ] = useState<string | null>(null);
    const watchroomShellRef = useRef<HTMLDivElement | null>(null);


    const handleVideoSubmit = (e: any) => {
        e.preventDefault();
        videoID.current = extractVideoId(videoInput);
        socket.emit("load-request", videoID.current, sessionToken.current);
        handleAddToHistory();
    };

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
    };

    const handleMakeHost = (clientID: string) => {
        socket.emit("change-host", sessionToken.current, clientID);
    };

    const handleNicknameSubmit = (e: any) => {
        e.preventDefault();
        console.log(memberList);
        console.log(clientID.current);
        socket.emit("change-nickname", pendingNickname, sessionToken.current);
    }; 

    const handleChatMessage = (e: any) => {
        e.preventDefault();
        if (chatMessage === "") return;
        if (chatMessage.length > 100) return;
        socket.emit("send-chat-message", chatMessage, sessionToken.current);
        changeChatMessage("");
    };

    // const readDB = () => {
    //     socket.emit("read-db");
    // };

    const handleAddToQueue = async () => {
        videoID.current = extractVideoId(videoInput);

        if (!videoID) return;

        const result = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoID.current}&format=json`
        );

        if (!result.ok) return;
        const data = await result.json();

        socket.emit("add-video-to-queue", videoID.current, data.title, sessionToken.current);

        setVideoInput("");
    };

    const handleAddToHistory = async () => {
        videoID.current = extractVideoId(videoInput);

        if (!videoID) return;

        const result = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoID.current}&format=json`
        );

        if (!result.ok) return;
        const data = await result.json();

        socket.emit("add-video-to-history", videoID.current, data.title, sessionToken.current);

        setVideoInput("");
    };

    const getThumbnail = (queuedVideoID: string) => {
        return `https://img.youtube.com//vi/${queuedVideoID}/mqdefault.jpg`;
    };

    const queueClick = (id: string, position: number) => {
        if (!isHost) return;

        socket.emit("load-from-queue", id, position, sessionToken.current);
    };

    const historyClick = (prevVideoID: string, title: string) => {
        if (!isHost) return;

        socket.emit("add-video-to-queue", prevVideoID, title, sessionToken.current);
        // console.log("confirmed history click");
        // socket.emit("load-from-history", prevVideoID, sessionStorage.getItem("token"));
    };

    const goHome = () => {
        navigate("/");
        socket.emit("leave-session");
    };

    const toggleFullscreen = () => {
        const shell = watchroomShellRef.current;
        if (!shell) return;

        if (!document.fullscreenElement) {
            shell.requestFullscreen();
        } else {
            document.exitFullscreen()
        };
    };

    const openBanOverlay = (id: string) => {
        setBanOverlay(id);
    };

    const banConfirm = (id: string) => {
        console.log("banning " + id);
        setBanOverlay(null);
        socket.emit("ban", sessionToken.current,id);
    };

    const banCancel = () => {
        setBanOverlay(null);
    };

    // const clearActivity = () => {
    //     socket.emit("clear-logs-request");
    // };

    useEffect(() => {
        console.log("confirm");
        // managing nickname persistence across page reload
        // const prevSessionID = sessionStorage.getItem("prevSessionID");
        // if (prevSessionID != sessionID) sessionStorage.clear();
        // sessionStorage.setItem("prevSessionID", sessionID);

        // const nickname = sessionStorage.getItem("nickname");
        //
        // if (!sessionStorage.getItem("clientID")) sessionStorage.setItem("clientID", crypto.randomUUID())
        // const clientID = sessionStorage.getItem("clientID");

        socket.emit("join-session", sessionID, localToken.current, sessionToken.current);

        socket.on("joined-session", () => {
            socket.emit("fetch-members");
            socket.emit("fetch-video");
            socket.emit("fetch-chat-history");
            socket.emit("fetch-video-queue");
            socket.emit("fetch-video-history");
            socket.emit("fetch-initial-time");
            socket.emit("fetch-activity");
            socket.emit("fetch-lock-state");
            socket.emit("fetch-client-id");
        });
        socket.on("session-invalid", () => {
            navigate("/not-found", { replace: true }); 
        })
        socket.on("send-members", (members) => {
            setMembers(members);
        })
        socket.on("send-nickname", (newNickname) => {
            changeNickname(newNickname);
            changePendingNickname(newNickname);
        })
        socket.on("auth-token", (newLocalToken: string, newSessionToken: string) => {
            localStorage.setItem("yousync-localToken", newLocalToken);
            sessionStorage.setItem("yousync-sessionToken", newSessionToken);
            localToken.current = newLocalToken;
            sessionToken.current = newSessionToken;
            socket.emit("check-hostship", sessionToken.current);
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
        socket.on("update-video-queue", (item) => {
            updateVideoQueue((prev) =>
                [...prev, item].sort( (a, b) => a.position - b.position)
            ); // unsure if [...prev, item] will preserve the order I want. so sort it
        });
        socket.on("send-video-queue", (queue) => {
            updateVideoQueue(queue);
        });
        socket.on("update-video-history", (item) => {
            updateVideoHistory((prev) =>
                [...prev, item].sort( (a, b) => a.position - b.position)
            ); // unsure if [...prev, item] will preserve the order I want. so sort it
        });
        socket.on("send-video-history", (queue) => {
            updateVideoHistory(queue);
        });
        socket.on("activity", (item) => {
            updateActivityLog((prev) =>
                [...prev, item].sort( (a, b) => a.position - b.position)
            ); // unsure if [...prev, item] will preserve the order I want. so sort it
        });
        socket.on("send-activity", (queue) => {
            updateActivityLog(queue);
        });
        socket.on("send-lock", (state: boolean) => {
            setRoomLocked(state);
        });
        socket.on("send-client-id", (id: string) => {
            clientID.current = id;
        });
        socket.on("clear-logs-order", () => {
            updateActivityLog([]);
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
            socket.off("update-video-queue");
            socket.off("send-video-queue");
            socket.off("update-video-history");
            socket.off("send-video-history");
            socket.off("activity");
            socket.off("send-activity");
            socket.off("send-lock");
            socket.off("send-client-id");
            socket.off("clear-logs-order");
        };
    }, []);

    useEffect(() => {
        // console.log("Video Queue is: ", videoQueue);
    }, [videoQueue]);
    useEffect(() => {
        // console.log("Video History is: ", videoHistory);
    }, [videoHistory]);
    useEffect(() => {
        function handleBFC(event: PageTransitionEvent) { // Back-Forward Cache
            if (event.persisted) window.location.reload();
        }

        window.addEventListener("pageshow", handleBFC);

        return () => {
            window.removeEventListener("pageshow", handleBFC);
        }
    }, []);


    return (
        <div>
            <div className={styles["scaffolding-1"]}>
                <span>Lock Room</span>
                {/* <div className={styles["scaffolding-2"]}> */}
                    <label className={styles["switch"]}>
                        <input
                            type="checkbox"
                            checked={roomLocked}
                            onChange={(e) => {
                                const locked = e.target.checked;
                                socket.emit("set-room-lock", locked, sessionToken.current);
                            }}
                        />
                        <span className={styles["slider"]} />
                    </label>
                    
                {/* </div> */}
            </div>

            <h1>Watch Room - Session ID: {sessionID} </h1>
            {isHost && 
                <form onSubmit={handleVideoSubmit}>
                    <input 
                        type="text" 
                        value={videoInput}
                        onChange={(e) => setVideoInput(e.target.value)}
                        placeholder="Paste YouTube link"
                    />


                    <button type="submit">Load Now</button>

                    <button type="button" onClick={handleAddToQueue}>Play Next</button>
                </form>
            }


            <div
                ref={watchroomShellRef}
                style={{
                    display: "flex",
                    flexDirection: "row",
                    // width: "640px",
                    height: "700px",
                    // border: "5px dashed white",
                }}
            >

                {/* VideoPlayer */}
                <div 
                    style={{
                    }}
                >
                    <VideoPlayer onToggleFullscreen={toggleFullscreen}/>
                </div>
                {/* VideoPlayer end */}
                
                
                {/* History and Queue */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                    }}
                >

                    {/* History */}
                    <div 
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            height: "300px",
                            width: "400px",
                            backgroundColor: "brown",
                            padding: "0px",
                            // border: "5px dashed white",
                        }}
                    >
                        <div>Video History</div>
                        <ul
                            style={{
                                overflowY: "auto",
                                // border: "5px dashed white",
                                margin: "0px",
                                padding: "20px",
                            }}
                        >
                        {videoHistory.map((previousVideo: QueueItem) => {
                            return (
                                <li 
                                    key={previousVideo.id} 
                                    style={{
                                        display: "flex",
                                        flexDirection: "row",
                                        color: "white",
                                        cursor: "pointer",
                                        marginBottom: "10px",
                                        backgroundColor: "rgba(50,50,100,1)",
                                        padding: "20px",
                                        border: "2px solid white",
                                        borderRadius: "5px",
                                    }}
                                    onClick={() => historyClick(previousVideo.videoID, previousVideo.title)}
                                >
                                    <img src={getThumbnail(previousVideo.videoID)} 
                                        alt="Video Thumbnail"
                                        style={{
                                            width: "128px",
                                            height: "78px",
                                            border: "2px solid gray",
                                            borderRadius: "5px",
                                        }}
                                    />
                                    <div>{previousVideo.title}</div>
                                </li>
                            );
                        })}
                        </ul>
                    </div>
                    {/* History end */}


                    {/* VideoQueue */}
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            height: "300px",
                            width: "400px",
                            backgroundColor: "red",
                            padding: "0px",
                        }}
                    >
                        <div>Video Queue</div>
                        <ul style={{
                            flexDirection: "column",
                            overflowY: "auto",
                            listStyleType: "none",
                            margin: "0px",
                            padding: "20px",
                        }}>
                        {videoQueue.map((queuedVideo: QueueItem) => {
                            return (
                                <li key={queuedVideo.id} 
                                style={{
                                    display: "flex",
                                    flexDirection: "row",
                                    color: "white",
                                    cursor: "pointer",
                                    marginBottom: "10px",
                                    backgroundColor: "rgba(50,50,100,1)",
                                    padding: "20px",
                                    border: "2px solid white",
                                    borderRadius: "5px",
                                }}
                                onClick={() => queueClick(queuedVideo.id, queuedVideo.position)}>
                                    <img src={getThumbnail(queuedVideo.videoID)} 
                                        alt="Video Thumbnail"
                                        style={{
                                            width: "128px",
                                            height: "78px",
                                            border: "2px solid gray",
                                            borderRadius: "5px",
                                        }}
                                    />
                                    <div>{queuedVideo.title}</div>
                                </li>
                            );
                        })}
                        </ul>
                    </div>
                    {/* VideoQueue end */}

                </div>
                {/* History and Queue end */}

                {/* Chat */}
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
                {/* Chat end */}
            
            </div>

            {/* Members */}
            <ul className={styles["member-list"]}>
                {memberList.map((entry: [string, string]) => {
                    return (
                        <li 
                            key={entry[0]} 
                            style={{
                                backgroundColor: (entry[1] === nickname) ? "green" : "none",
                            }}
                            className={styles["member-list-item"]}
                        >         

                            {(entry[0] === banOverlay &&
                                <div 
                                    className={styles["member-list-ban-overlay"]}
                                >
                                    This user ({entry[1]}) will no longer be able to enter this room.

                                    <div>
                                        <button onClick={() => banConfirm(entry[0])}>Confirm</button>
                                        <button onClick={() => banCancel()}>Cancel</button>
                                    </div>
                                </div>
                            )}

 
                            {entry[1]}
                            {(isHost && entry[0] != clientID.current) && <button onClick={() => handleMakeHost(entry[0])}>Make Host</button>}
                            {(isHost && entry[0] != clientID.current) && <button onClick={() => openBanOverlay(entry[0])}>Ban</button>}
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
            {/* Members End */}
                
            {/* Activity Log */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "300px",
                    width: "400px",
                    backgroundColor: "red",
                    padding: "0px",
                }}
            >
                <div>Activities</div>
                <ul style={{
                    flexDirection: "column",
                    overflowY: "auto",
                    listStyleType: "none",
                    margin: "0px",
                    padding: "20px",
                }}>
                {activityLog.map((activity: ActivityItem) => {

                    return (
                        <li key={activity.id} 
                        style={{
                            display: "flex",
                            flexDirection: "row",
                            color: "white",
                            cursor: "pointer",
                            marginBottom: "2px",
                            backgroundColor: "rgba(50,50,100,1)",
                            padding: "2px 5px",
                            border: "1px solid white",
                            borderRadius: "5px",
                            fontSize: "10px",
                        }}
                        >   
                            <div>{activity.eventNumber}: {activity.message}</div>
                        </li>
                    );
                })}
                </ul>
            </div>
            {/* Activity Log end */}
        
            <button onClick={goHome}>Home</button>
            {/* <button onClick={readDB}>Secret button to fix the DB</button> */}
            {/* <button onClick={clearActivity}>Secret button to clear Activity</button> */}
        </div>
    );
}

export default WatchRoom;