import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import VideoPlayer from "../components/VideoPlayer.tsx";
import socket from "../socket.ts";

function WatchRoom() {
    const { sessionID } = useParams<string>();
    const [ videoUrl, setVideoUrl ] = useState<string>("");
    const videoID = useRef<string>(""); // different from videoID in VideoPlayer.tsx! This one holds the ID extracted from the form, to be used only for changing
    const navigate = useNavigate();
    const [ memberList, setMembers ] = useState<[string, string][]>([]);
    const [ isHost, changeHostship ] = useState<boolean>(false);
    const [ nickname, changeNickname ] = useState<string>("");




    const handleSubmit = (e: any) => {
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
        socket.emit("fetch-members");
        socket.emit("fetch-video");


        socket.on("session-invalid", () => {
            navigate("/", { state: { error: "You tried to access a session that does not exist.", show: 1} });
        })
        socket.on("send-members", (members) => {
            setMembers(members);
        })
        socket.on("send-nickname", (newNickname) => {
            changeNickname(newNickname);
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


        return () => {
            // needed for in-page actions to trigger socket disconnect
            // example: using the "go to previous page" button in browser would usually NOT disconnect
            socket.emit("leave-session");

            socket.off("session-invalid");
            socket.off("send-members");
            socket.off("send-nickname");
            socket.off("auth-token");
            socket.off("become-host");
            socket.off("unbecome-host");
        }
    }, []);

    return (
        <div>
            <h1>Watch Room - Session ID: {sessionID} </h1>
            {isHost && <form onSubmit={handleSubmit}>
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
                        <li key={entry[0]}>
                            {entry[1]}
                            {(isHost && entry[1] != nickname) && <button onClick={() => handleMakeHost(entry[0])}>Make Host</button>}
                            {(isHost && entry[1] != nickname) && <button>Kick</button>}
                            {/* {isHost && <button onClick={() => handleMakeHost(entry[0])}>Make Host</button>} */}
                            {/* {isHost && <button>Kick</button>} */}
                        </li>
                    )
                })}
            </ul>
        </div>
    );
}

export default WatchRoom;