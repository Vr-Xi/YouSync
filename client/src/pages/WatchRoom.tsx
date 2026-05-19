import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import VideoPlayer from "../components/VideoPlayer.tsx";
import socket from "../socket.ts";

function WatchRoom() {
    const { sessionID } = useParams<string>();
    const [ videoUrl, setVideoUrl ] = useState<string>("");
    const [ videoID, setVideoID ] = useState<string>("");
    const navigate = useNavigate();
    const [ memberList, setMembers ] = useState<[string, string][]>([]);



    const handleSubmit = (e: any) => {
        e.preventDefault();
        setVideoID(extractVideoId(videoUrl));
        console.log("Video ID:", videoID);
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

    useEffect(() => {
        // managing nickname persistence across page reload
        const prevSessionID = sessionStorage.getItem("prevSessionID");
        if (prevSessionID != sessionID) sessionStorage.clear();
        sessionStorage.setItem("prevSessionID", sessionID);

        const nickname = sessionStorage.getItem("nickname");
        //

        socket.emit("join-session", sessionID, nickname);
        socket.emit("fetch-members");


        socket.on("session-invalid", () => {
            navigate("/", { state: { error: "You tried to access a session that does not exist.", show: 1} });
        })
        socket.on("send-members", (members) => {
            setMembers(members);
        })
        socket.on("send-nickname", (newNickname) => {
            sessionStorage.setItem("nickname", newNickname);
        })


        return () => {
            // needed for in-page actions to trigger socket disconnect
            // example: using the "go to previous page" button in browser would usually NOT disconnect
            socket.emit("leave-session");

            socket.off("session-invalid");
            socket.off("send-members");
            socket.off("send-nickname");
        }
    }, []);

    return (
        <div>
            <h1>Watch Room - Session ID: {sessionID} </h1>
            <form onSubmit={handleSubmit}>
                <input 
                    type="text" 
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="Paste YouTube link"
                />
                <button type="submit">Load Video</button>
            </form>
            <VideoPlayer video={videoID}/>
            <ul>
                {memberList.map((entry: [string, string]) => {
                    return <li key={entry[0]}>{entry[1]}</li>
                })}
            </ul>
        </div>
    );
}

export default WatchRoom;