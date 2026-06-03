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
        // console.log("Player ready!");
        playerRef.current = event.target;
        console.log(playerRef.current);
    }

    const handleLoadOrder = (video: string) => {
        setVideoID(video);
    }

    const handlePlay = () => {

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

        serversideStatus.current = "playing";
    };
    
    const handlePause = () => {
        
        if (suppressInvisibleEmits.current) return; // stop outright.

        if (suppressPause.current) {
            return;
        }

        const time = Math.round(playerRef.current?.getCurrentTime() * 100) / 100;
        socket.emit("pause-video", time);

        serversideStatus.current = "paused";
    };

    // const handleStateChange = (event: { data: number } ) => {
    //     // use this if you want to find out more about the events that exist
    // };

    const onPlayOrder = (time: number) => {
        if (playerRef.current.getPlayerState() === 5) {
            // console.log("Player was ordered to play, but refused because it was unstarted.");
            return;
        };

        if (playerRef.current) {
            suppressPlay.current = true;
            playerRef.current.seekTo(time, true);
            playerRef.current.playVideo();
        };
    };

    const onPauseOrder = (time: number) => {
        if (playerRef.current.getPlayerState() === 5) {
            // console.log("Player was ordered to pause, but refused because it was unstarted.");
            return;
        };

        if (playerRef.current) {
            suppressPause.current = true;
            setTimeout(() => {
                suppressPause.current = false; //fine, I yield. I don't know how else to *completely* suppress the mystery emits. only this works. damn it.
            }, 1_000);
            playerRef.current.seekTo(time, true);
            playerRef.current.pauseVideo();
            // suppressPause.current = false; // needed to solve an edge case, where every second intentional pause emit would be swallowed otherwise
        };
    };

    const seekToTime = (status: string, time: number, updatedAt: number) => {
        // console.log("Fetch-time returned: " + time);
        const player = playerRef.current;

        serversideStatus.current = status; // no harm in setting these either way, I think. Might not need em
        newArrivalTime.current = time;

        if (!player) return;

        if (updatedAt) time = time + (Date.now() - updatedAt) / 1000;

        if (time > 0) { // needed to address an edge case, where the player would otherwise auto-play for the first person that comes into a session
            playerRef.current.seekTo(time, true);
        }
        
        if (serversideStatus.current === "paused") {
            suppressPause.current = true;
            setTimeout(() => {
                suppressPause.current = false; // hate, hate, hate
            }, 1_000);
            player.pauseVideo();
        }
    }

    function handleSyncCheck(status: string, time: number, updatedAt: number) {
        const player = playerRef.current;
        if (!player) return;
        if (status != "playing") return;

        time = time + (Date.now() - updatedAt) / 1000;

        const drift = time - player.getCurrentTime();

        if (Math.abs(drift) > 2) {
            playerRef.current.seekTo(time, true);
        }
    };
    // const canEmit = () => {
        // May need to make this.
    // };


    //---------------------------- useEffect

    useEffect(() => {

        socket.on("load-order", handleLoadOrder);
        

        return () => {
            socket.off("load-order");
        }

    }, []);

    useEffect(() => {
        socket.on("video-play-order", onPlayOrder);
        socket.on("video-pause-order", onPauseOrder);
        socket.on("send-time", seekToTime);
        socket.on("sync-check", handleSyncCheck);

        return () => {
            socket.off("video-play-order", onPlayOrder);
            socket.off("video-pause-order", onPauseOrder);
            socket.off("send-time", seekToTime);
            socket.off("synch-check", handleSyncCheck);
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
            if (!player) return;
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


    useEffect(() => {
        const intervalID = window.setInterval(() => {
            if (!playerRef.current) return;
            if (newArrival.current) return;

            socket.emit("request-sync-check");
        }, 5000);

        return () => {
            window.clearInterval(intervalID);
        };


    }, []);

    // dev testing
    // function devPlusTen() {
    //     const player = playerRef.current;
    //     (!player);

    //     suppressPlay.current = true;
    //     player.seekTo(playerRef.current.getCurrentTime() + 10);
    // };

    
    // function devMinusTen() {
    //     const player = playerRef.current;
    //     (!player);

    //     suppressPlay.current = true;
    //     player.seekTo(playerRef.current.getCurrentTime() - 10);
    // };


    if (!videoID) return <div style={{ width: "640px", height: "390px", backgroundColor: "rgba(0,0,25,1)" }}/>

    return (
        <YouTube
            videoId={videoID}
            onReady={handleReady}
            // onStateChange={(e) => console.log(e.data)} // enemy
            onPlay={handlePlay}
            onPause={handlePause}
            opts={{ width: "640", height: "390", playerVars: { autoplay: 0 } }}
        />
    );

}

export default VideoPlayer;