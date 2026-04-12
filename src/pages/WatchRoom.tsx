import { useState } from "react";
import { useParams } from "react-router-dom";
import VideoPlayer from "../components/VideoPlayer.tsx";

function WatchRoom() {
    const { sessionID } = useParams<string>();
    const [ videoUrl, setVideoUrl ] = useState<string>("");
    const [ videoID, setVideoID ] = useState<string>("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setVideoID(extractVideoId(videoUrl));
        console.log("Video ID:", videoID);
    }

    const extractVideoId = (url: string) => {
        if (url.startsWith("https://www.youtube.com/watch?v=")) {
            return url.slice(32, url.length);
        }
        if (url.startsWith("www.youtube.com/watch?v=")) {
            return url.slice(24, url.length);
        }
        if (url.startsWith("youtube.com/watch?v=")) {
            return url.slice(20, url.length);
        }

        return url;
    }

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
        </div>
    );
}

export default WatchRoom;