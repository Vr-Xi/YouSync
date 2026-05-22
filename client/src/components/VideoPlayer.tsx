import { useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import socket from "../socket.ts";


const VideoPlayer = () => {
    const playerRef = useRef<any>(null);
    const [ videoID, setVideoID ] = useState<string | null>(null);

    const handleReady = (event: any) => {
        console.log("Player ready!");
        playerRef.current = event.target;
    }

    useEffect(() => {
        socket.on("load-order", (video) => setVideoID(video));

        return () => {
            socket.off("load-order");
        }
    }, []);


    if (!videoID) return <div />

    return (
        <YouTube
            videoId={videoID}
            onReady={handleReady}
            opts={{ width: "640", height: "390", playerVars: { autoplay: 0 } }}
        />
    );

}

export default VideoPlayer;