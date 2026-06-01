import { useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import type { YouTubeEvent, YouTubePlayer } from "react-youtube";
import socket from "../socket.ts";


const VideoPlayer = () => {
    const playerRef = useRef<YouTubePlayer | null>(null);
    const [ videoID, setVideoID ] = useState<string | null>(null);
    const suppressPlay = useRef<boolean>(false);
    const suppressPause = useRef<boolean>(false);
    const newArrival = useRef<boolean>(true);
    const newArrivalTime = useRef<number | null>(null);
    const serversideStatus = useRef<string | null>(null);
    const suppressInvisibleEmits = useRef<boolean>(false);

    const handleReady = (event: YouTubeEvent) => {
        console.log("Player ready!");
        playerRef.current = event.target;
    }

    const handleLoadOrder = (video: string) => {
        setVideoID(video);
    }

    const handlePlay = () => {
        serversideStatus.current = "playing";
        if (suppressInvisibleEmits.current) return; // stop outright.

        if (suppressPlay.current) {
            suppressPlay.current = false;
            return;
        }
        
        if (newArrival.current) {
            socket.emit("fetch-time");
            if (serversideStatus.current === "paused") playerRef.current?.pauseVideo();
            newArrival.current = false;
            socket.emit("update-time");
            return;
        };

        const time = Math.round(playerRef.current?.getCurrentTime() * 100) / 100;
        socket.emit("play-video", time);
    };
    
    const handlePause = () => {
        serversideStatus.current = "paused";
        
        if (suppressInvisibleEmits.current) return; // stop outright.

        if (suppressPause.current) {
            suppressPause.current = false;
            return;
        }

        const time = Math.round(playerRef.current?.getCurrentTime() * 100) / 100;
        socket.emit("pause-video", time);
    };

    // const handleStateChange = (event: { data: number } ) => {
    //     // use this if you want to find out more about the events that exist
    // };

    const onPlayOrder = (time: number) => {
        if (playerRef.current) {
            playerRef.current.seekTo(time, true);
            suppressPlay.current = true;
            playerRef.current.playVideo();
        }
    }

    const onPauseOrder = (time: number) => {
        if (playerRef.current) {
            playerRef.current.seekTo(time, true);
            suppressPause.current = true;
            playerRef.current.pauseVideo();
            suppressPause.current = false; // needed to solve an edge case, where every second intentional pause emit would be swallowed otherwise
        }
    }

    const seekToTime = (time: number, status: string) => {
        // console.log("Fetch-time returned: " + time);
        if (playerRef.current) {
            if (time > 0) { // needed to address an edge case, where the player would otherwise auto-play for the first person that comes into a session
                playerRef.current.seekTo(time, true);
            }
        }
        
        serversideStatus.current = status;
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
        // there is weird standard behavior, where a tab that's muted AND currently isn't directly looked at by the user, will automatically pause the video
        // this is a problem, because it will cause emits
        // so: what if there's a user in a session that mutes their video, and goes to another browser tab to do something else?
        // the answer is: that user will constantly re-emit a pause order, with their own timestamp, resetting the entire room to their own time, over and over
        // this entire useEffect() is dedicated to solving that.

        const onVisibilityChange = () => {
            const visibility = document.visibilityState;
            const player = playerRef.current;
            if (visibility === "hidden" && player.isMuted()) { 
                suppressInvisibleEmits.current = true;
                // console.log("player tried to do the sneaky thing");
            }
            else if (visibility === "visible" && player.isMuted()) {
                suppressInvisibleEmits.current = false;
                suppressPlay.current = true;
                socket.emit("fetch-time");
            }
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