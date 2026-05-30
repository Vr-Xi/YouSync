import { useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import type { YouTubeEvent, YouTubePlayer } from "react-youtube";
import socket from "../socket.ts";


const VideoPlayer = () => {
    const playerRef = useRef<YouTubePlayer | null>(null);
    const [ videoID, setVideoID ] = useState<string | null>(null);
    const suppressPlay = useRef<boolean>(false);
    const suppressPause = useRef<boolean>(false);
    const suppressEmit = useRef<boolean>(false);
    const newArrival = useRef<boolean>(true);
    const newArrivalStatus = useRef<string | null>(null);
    const newArrivalTime = useRef<number | null>(null);
    const suppressInvisibleEmits = useRef<boolean>(false);

    const handleReady = (event: YouTubeEvent) => {
        console.log("Player ready!");
        playerRef.current = event.target;
        console.log(playerRef.current);
        // playerRef.current?.seekTo(newArrivalTime.current, false);
        socket.emit("fetch-time");
    }

    const handleLoadOrder = (video: string) => {
        setVideoID(video);
    }

    const handlePlay = () => {
        console.log("handlePlay was called");
        if (suppressPlay.current) {
            // console.log("play emit was suppressed");
            suppressPlay.current = false;
            // console.log("suppressPlay was set to false");
            return;
        }
        
        if (newArrival.current) {
            if (newArrivalStatus.current === "paused") playerRef.current?.pauseVideo();
            newArrival.current = false;
            return;
        };

        const time = Math.round(playerRef.current?.getCurrentTime() * 100) / 100;
        socket.emit("play-video", time);
    };
    
    const handlePause = () => {
        console.log("handlePause was called");
        if (suppressPause.current) {
            console.log("pause emit was suppressed");
            suppressPause.current = false;
            // console.log("suppressPause was set to false");
            return;
        }

        const time = Math.round(playerRef.current?.getCurrentTime() * 100) / 100;
        socket.emit("pause-video", time);
    };

    // const handleStateChange = (event: { data: number } ) => {
    //     // use this if you want to find out more about the events that exist
    // };

    const onPlayOrder = (time: number) => {
        console.log("onPlayOrder was called");
        if (playerRef.current) {
            // console.log("suppressPlay was set to true");
            playerRef.current.seekTo(time, true);
            suppressPlay.current = true;
            playerRef.current.playVideo();
        }
    }

    const onPauseOrder = (time: number) => {
        console.log("onPauseOrder was called");
        if (playerRef.current) {
            // console.log("suppressPause was set to true");
            playerRef.current.seekTo(time, true);
            suppressPause.current = true;
            playerRef.current.pauseVideo();
            suppressPause.current = false; // needed to solve an edge case, where every second intentional pause emit would be swallowed otherwise
        }
    }

    const seekToTime = (time: number, status: string) => {
        console.log("Fetch-time returned: " + time);
        if (playerRef.current) {
            if (time > 0) { // needed to address an edge case, where the player would otherwise auto-play for the first person that comes into a session
                playerRef.current.seekTo(time, true);
            }
        }
        
        newArrivalStatus.current = status;
        newArrivalTime.current = time;
    }

    // const canEmit = () => {
        // May need to make this.
    // };


    //---------------------------- useEffect

    useEffect(() => {

        // console.log("suppressPlay is: " + suppressPlay.current);
        // console.log("suppressPause is: " + suppressPause.current);
        socket.on("load-order", handleLoadOrder);

        return () => {
            socket.off("load-order");
        }
    }, []);

    useEffect(() => {

        socket.on("video-play-order", onPlayOrder);
        socket.on("video-pause-order", onPauseOrder);
        socket.on("send-time", seekToTime);

        return () => {
            socket.off("video-play-order", onPlayOrder);
            socket.off("video-pause-order", onPauseOrder);
            socket.off("send-time", seekToTime);
        };

    }, []);

    useEffect(() => {
        const onVisibilityChange = () => {
            const visibility = document.visibilityState;
            // if (visibility === "hidden") suppressInvisibleEmits.current = true;
            // else suppressInvisibleEmits.current = false;
            // if (visibility === "hidden") suppressPause.current = true;
            // else suppressPause.current = false;
            // console.log(visibility);
            return visibility;
        }


        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
        }
    }, []);


    if (!videoID) return <div style={{ width: "640px", height: "390px", backgroundColor: "rgba(0,0,25,1)" }}/>

    return (
        <YouTube
            videoId={videoID}
            onReady={handleReady}
            // onStateChange={handleStateChange}
            onPlay={handlePlay}
            onPause={handlePause}
            opts={{ width: "640", height: "390", playerVars: { autoplay: 0 } }}
        />
    );

}

export default VideoPlayer;