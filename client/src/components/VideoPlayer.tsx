import { useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import type { YouTubeEvent, YouTubePlayer } from "react-youtube";
import socket from "../socket.ts";


function l(log: string) {
    console.log(log);
};

const VideoPlayer = () => {
    const playerRef = useRef<YouTubePlayer | null>(null);
    const [ videoID, setVideoID ] = useState<string | null>(null);
    const suppressPlay = useRef<boolean>(false);
    const suppressPause = useRef<boolean>(false);
    const newArrival = useRef<boolean>(true);
    const newArrivalTime = useRef<number | null>(null);
    const newArrivalTimestamp = useRef<number | null>(null);
    const serversideStatus = useRef<string | null>(null);
    const suppressInvisibleEmits = useRef<boolean>(false);
    // const timedSuppressInEffect = useRef<boolean>(true);  // might need this

    const handleReady = (event: YouTubeEvent) => {
        // console.log("Player ready!");
        playerRef.current = event.target;
        // console.log(playerRef.current);
    };

    const handleLoadOrder = (video: string, status: string, time: number, timestamp: number | null) => {
        setVideoID(video);
        serversideStatus.current = status;
        newArrivalTime.current = time;
        newArrivalTimestamp.current = timestamp;
        l("LoadOrder says: " + status + " " + time + " " + timestamp);
    };

    const handlePlay = () => {

        if (suppressInvisibleEmits.current) return; // stop outright.

        if (suppressPlay.current) {
            suppressPlay.current = false;
            console.log("a PLAY action was suppressed at: " + new Date(Date.now()).toLocaleTimeString());
            return;
        }
        
        if (newArrival.current) {
            l("entered new arrival");
            l("attempted to seek to: " + newArrivalTime.current);
            l("and timestamp is: " + newArrivalTimestamp.current);
            seekToTime(serversideStatus.current, newArrivalTime.current, newArrivalTimestamp.current);
            if (serversideStatus.current === "paused") {
                timedSuppress("pause");
                playerRef.current?.pauseVideo();
            }
            newArrival.current = false;
            timedSuppress("play");
            if (serversideStatus.current !== "paused") socket.emit("update-time"); // why did we need this before?
            // ooooh i remember, yeah this is giga necessary for a specific edge case
            return;
        };

        const time = Math.round(playerRef.current?.getCurrentTime() * 10000) / 10000;
        socket.emit("play-video", time, Date.now()); // decided to try and send the current Date.now() from client end, in an attempt to better account for latency

        serversideStatus.current = "playing";
    };
    
    const handlePause = () => {
        
        if (suppressInvisibleEmits.current) return; // stop outright.

        if (suppressPause.current) {
            // you can NOT unset the suppressPause flag here. It WILL break.
            // Because of the mystery emits misbehaving all the time, you see.
            console.log("a PAUSE action was suppressed at: " + new Date(Date.now()).toLocaleTimeString());
            return;
        }

        const time = Math.round(playerRef.current?.getCurrentTime() * 10000) / 10000;
        socket.emit("pause-video", time);

        serversideStatus.current = "paused";
    };

    // const handleStateChange = (event: { data: number } ) => {
    //     // use this if you want to find out more about the events that exist
    // };

    const onPlayOrder = (time: number, timestamp: number) => {
        serversideStatus.current = "playing";

        if (playerRef.current.getPlayerState() === 5) {
            console.log("Player was ordered to play, but refused because it was unstarted.");
            newArrivalTime.current = time;
            newArrivalTimestamp.current = timestamp;
            return;
        };

        if (playerRef.current) {
            console.log("Play order received. Current status of suppression is: " + suppressPlay.current);
            suppressPlay.current = true;
            playerRef.current.seekTo(time, true);
            playerRef.current.playVideo();
        };
    };

    const onPauseOrder = (time: number) => {
        serversideStatus.current = "paused";

        if (playerRef.current.getPlayerState() === 5) {
            console.log("Player was ordered to pause, but refused because it was unstarted.");
            newArrivalTime.current = time;
            return;
        };

        if (playerRef.current) {
            // suppressPause.current = true;
            // setTimeout(() => {
            //     suppressPause.current = false; //fine, I yield. I don't know how else to *completely* suppress the mystery emits. only this works. damn it.
            // }, 1_000);
            timedSuppress("pause"); // it's a sad day
            playerRef.current.seekTo(time, true);
            playerRef.current.pauseVideo();
            // suppressPause.current = false; // needed to solve an edge case, where every second intentional pause emit would be swallowed otherwise
        };
    };

    const seekToTime = (status: string, time: number, updatedAt: number) => {
        // console.log("Fetch-time returned: " + time);
        // console.log("seekTo was triggered");
        // console.log(status, time, updatedAt);
            

        const player = playerRef.current;

        serversideStatus.current = status; // no harm in setting these either way, I think. Might not need em

        if (!player) return;

        if (updatedAt) time = time + (Date.now() - updatedAt) / 1000;

        if (time > 0) { // needed to address an edge case, where the player would otherwise auto-play for the first person that comes into a session
            playerRef.current.seekTo(time, true);
        }
        
        if (serversideStatus.current === "paused") {
            // suppressPause.current = true;

            // setTimeout(() => {
            //     suppressPause.current = false; // hate, hate, hate
            // }, 1_000);
            // console.log("this is what causes the initial pause. proof:");
            // console.log("-- " + suppressPause.current);
            timedSuppress("pause");
            player.pauseVideo();
            // console.log("-- " + suppressPause.current);
        };
    }

    function handleSyncCheck(status: string, time: number, updatedAt: number) {
        const player = playerRef.current;
        if (!player) return;
        if (status != "playing") return;

        time = time + (Date.now() - updatedAt) / 1000;

        const drift = time - player.getCurrentTime();

        // l("Synch Check Report: ");
        // l("--- Status: " + status);
        // l("--- Time: " + time);
        // l("--- Update: " + updatedAt);

        if (Math.abs(drift) > 2) {
            playerRef.current.seekTo(time, true);
        }
    };
    // const canEmit = () => {
        // May need to make this.
    // };
    function timedSuppress(action: "play" | "pause") {

        if (action === "play") {
            suppressPlay.current = true;

            setTimeout(() => {
                suppressPlay.current = false;
            }, 1_000);
        }        
        if (action === "pause") {
            suppressPause.current = true;

            setTimeout(() => {
                suppressPause.current = false;
            }, 1_000);
        }
        // sadly, it seems the best way to handle mysterious (INCONSISTENT) emits is, suppress them by time, not by amount of occurrances. :)))))))))
        // yeah so far this works best, unfortunately.
    };

    function handleInitialTime(status: string, time: number, timestamp: number) {
        serversideStatus.current = status;
        newArrivalTime.current = time;
        newArrivalTimestamp.current = timestamp;
        l("send-initial-time results are: " + status + " " + time + " " + timestamp);
    };


    //---------------------------- useEffect

    useEffect(() => {

        socket.on("load-order", handleLoadOrder);
        

        return () => {
            socket.off("load-order");
        }

    }, []);

    useEffect(() => {
        socket.on("send-initial-time", handleInitialTime);
        socket.on("video-play-order", onPlayOrder);
        socket.on("video-pause-order", onPauseOrder);
        socket.on("send-time", seekToTime);
        socket.on("sync-check", handleSyncCheck);

        return () => {
            socket.off("send-initial-time", handleInitialTime);
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
            if (player.getPlayerState() === 5) return;
            if (visibility === "hidden" && player.isMuted()) { 
                suppressInvisibleEmits.current = true;
                // console.log("player tried to do the sneaky thing");
            }
            else if (visibility === "visible" && player.isMuted()) {
                console.log("Visibility report says server status is: " + serversideStatus.current);
                console.log("Visibility report says play suppression is currently: " + suppressPlay.current);
                suppressInvisibleEmits.current = false;
                if (serversideStatus.current === "playing") suppressPlay.current = true;
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
        }, 10_000);

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