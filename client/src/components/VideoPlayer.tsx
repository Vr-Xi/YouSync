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
    const newArrivalStatus = useRef<string | null>(null);
    const newArrivalTime = useRef<number | null>(null);

    const handleReady = (event: YouTubeEvent) => {
        console.log("Player ready!");
        playerRef.current = event.target;
        // console.log(playerRef.current);
        // playerRef.current?.seekTo(newArrivalTime.current, false);
    }

    const handleLoadOrder = (video: string, status: string, time: number) => {
        setVideoID(video);
        console.log("Time is: " + time);
        
        newArrivalStatus.current = status;
        newArrivalTime.current = time;
    }

    const handlePlay = () => {
        if (suppressPlay.current) {
            console.log("play emit was suppressed");
            suppressPlay.current = false;
            return;
        }
        
        if (newArrival.current) {
            newArrival.current = false;
            socket.emit("fetch-time");
            return;
        };

        const time = Math.round(playerRef.current?.getCurrentTime() * 100) / 100;
        console.log(time);
        socket.emit("play-video", time);
    };
    
    const handlePause = () => {
        if (suppressPlay.current) {
            console.log("pause emit was suppressed");
            suppressPause.current = false;
            return;
        }

        const time = Math.round(playerRef.current?.getCurrentTime() * 100) / 100;
        socket.emit("pause-video", time);
    };

    // const handleStateChange = (event: { data: number } ) => {
    //     // use this if you want to find out more about the events that exist
    // };
    const onPlay = (time: number) => {
        if (playerRef.current) {
            suppressPlay.current = true;
            playerRef.current.seekTo(time, true);
            playerRef.current.playVideo();
        }
    }

    const onPause = (time: number) => {
        if (playerRef.current) {
            suppressPause.current = true;
            playerRef.current.seekTo(time, true);
            playerRef.current.pauseVideo();
        }
    }

    const seekToTime = (time: number) => {
        console.log("Trying to seek to time: " + time);
        if (playerRef.current) {
            playerRef.current.seekTo(time, true);
        }
    }


    //---------------------------- useEffect

    useEffect(() => {
        socket.on("load-order", handleLoadOrder);

        return () => {
            socket.off("load-order");
        }
    }, []);

    useEffect(() => {

        socket.on("play-video", onPlay);
        socket.on("pause-video", onPause);
        socket.on("send-time", seekToTime);

        return () => {
            socket.off("play-video", onPlay);
            socket.off("pause-video", onPause);
            socket.off("send-time", seekToTime);
        };

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