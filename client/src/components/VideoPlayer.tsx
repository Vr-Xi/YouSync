import { useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import type { YouTubeEvent, YouTubePlayer } from "react-youtube";
import socket from "../socket.ts";


function l(log: string | number) {
    console.log(log);
};

type VideoPlayerProps = {
    onToggleFullscreen: () => void;
};

const VideoPlayer = ({ onToggleFullscreen }: VideoPlayerProps) => {
    const playerRef = useRef<YouTubePlayer | null>(null);
    const [ videoID, setVideoID ] = useState<string | null>(null);
    const [ duration, setDuration ] = useState<number>(0);
    const [ currentTime, setCurrentTime ] = useState<number>(0);
    const [ volume, setVolume ] = useState<number>(50);
    const draggingTimeline = useRef<boolean>(false);
    const newArrival = useRef<boolean>(true);
    const [ isPlaying, toggleIsPlaying ] = useState<boolean>(false);
    const [ isMuted, toggleIsMuted ] = useState<boolean>(false);
    const newArrivalTime = useRef<number | null>(null);
    const newArrivalTimestamp = useRef<number | null>(null);
    const serversideStatus = useRef<string | null>(null);

    function handleReady(event: YouTubeEvent) {
        // console.log("Player ready!");
        playerRef.current = event.target;

        const player = playerRef.current;
        const localStorageVolume = localStorage.getItem("yousync-volume");
        const initialVolume = (localStorageVolume) ? Number(localStorageVolume) : player.getVolume();

        setDuration(player.getDuration());
        changeVolume(initialVolume);

        console.log(playerRef.current);
    };

    function handleLoadOrder(video: string, status: string, time: number, timestamp: number | null) {
        setVideoID(video);
        serversideStatus.current = status;
        newArrival.current = true;
        newArrivalTime.current = time;
        newArrivalTimestamp.current = timestamp;

    };

    function handlePlayerClick() {
        // this is just better than dynamic emit suppression
        // took me like, 30+ hours of debgging before landing on this
        const player = playerRef.current;
        if (!player) return;

        const state = player.getPlayerState();

        if (newArrival.current) {
            newArrival.current = false;
            
            if (serversideStatus.current === "paused") {
                player.seekTo(newArrivalTime.current);
                toggleIsPlaying(true);
                socket.emit("play-video", newArrivalTime.current, Date.now());
            } else if (serversideStatus.current === "playing") {
                player.seekTo(newArrivalTime.current + (Date.now() - newArrivalTimestamp.current) / 1000);
                // player.seekTo(newArrivalTime.current);
                toggleIsPlaying(true);
                player.playVideo();
            } else {
                toggleIsPlaying(true);
                player.playVideo();
                socket.emit("play-video", 0, Date.now());
            }
            return;
        }

        
        if (state === 1) {
            toggleIsPlaying(false);
            player.pauseVideo();
            const time = Math.round(player.getCurrentTime() * 10000) / 10000;
            socket.emit("pause-video", time); // decided to try and send the current Date.now() from client end, in an attempt to better account for latency
            
            return;
        };

        if (state === 2) {
            toggleIsPlaying(true);
            player.playVideo();
            const time = Math.round(playerRef.current?.getCurrentTime() * 10000) / 10000;
            socket.emit("play-video", time, Date.now());

            return;
        }
        
    };

    function onPlayOrder (time: number, timestamp: number) {
        serversideStatus.current = "playing";

        const player = playerRef.current;
        if (!player) return;

        if (player.getPlayerState() === 5) {
            console.log("Player was ordered to play, but refused because it was unstarted.");
            newArrivalTime.current = time;
            newArrivalTimestamp.current = timestamp;
            return;
        };

        toggleIsPlaying(true);
        player.seekTo(time, true);
        setCurrentTime(time);
        player.playVideo();
    };

    function onPauseOrder(time: number) {
        serversideStatus.current = "paused";

        const player = playerRef.current;
        if (!player) return;

        if (player.getPlayerState() === 5) {
            console.log("Player was ordered to pause, but refused because it was unstarted.");
            newArrivalTime.current = time;
            return;
        };

        // suppressPause.current = true;
        // setTimeout(() => {
        toggleIsPlaying(false);
        player.seekTo(time, true);
        setCurrentTime(time);
        player.pauseVideo();
        // suppressPause.current = false; // needed to solve an edge case, where every second intentional pause emit would be swallowed otherwise
    };

    function seekToTime(status: string, time: number, updatedAt: number) {
        // console.log("Fetch-time returned: " + time);
        // console.log("seekTo was triggered");
        // console.log(status, time, updatedAt);
            

        const player = playerRef.current;
        if (!player) return;

        serversideStatus.current = status; // no harm in setting these either way, I think. Might not need em


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
            player.pauseVideo();
            // console.log("-- " + suppressPause.current);
        };
    }

    function handleSyncCheck(status: string, time: number, updatedAt: number) {
        const player = playerRef.current;
        if (!player) return;
        if (status != "playing") return;
        if (player.getPlayerState() === 0 || player.getPlayerState === 5) return;

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

    function handleInitialTime(status: string, time: number, timestamp: number) {
        serversideStatus.current = status;
        newArrivalTime.current = time;
        newArrivalTimestamp.current = timestamp;
        // newArrivalTimestamp.current = Date.now(); // actually, this is better, lmao
    };

    function handleSlider() {
        const player = playerRef.current;
        if (!player) return;
        if (draggingTimeline.current) return;

        const state = player.getPlayerState();

        if (state === 1) {
            socket.emit("play-video", currentTime, Date.now())
            
            player.seekTo(currentTime);
            return;
        }

        if (state === 2) {
            socket.emit("pause-video", currentTime)
            
            player.seekTo(currentTime);
            return;
        }
    };

    function timeformat(seconds: number) {
        seconds = Math.floor(seconds);
        let hours: number = 0;
        let minutes: number = 0;

        while (seconds >= 60) {
            seconds -= 60;
            minutes += 1;
        }
        while (minutes >= 60) {
            minutes -= 60;
            hours += 1;
        }

        const hours_string = (hours < 10) ? "0" + String(hours) : String(hours);
        const minutes_string = (minutes < 10) ? "0" + String(minutes) : String(minutes);
        const seconds_string = (seconds < 10) ? "0" + String(seconds) : String(seconds);
        
        if (hours > 0) {    
            return hours_string + ":" + minutes_string + ":" + seconds_string
        }
        else if (minutes > 0) {
            return minutes_string + ":" + seconds_string;
        }
        else return "00:" + seconds_string; 
    };

    function changeVolume(newVolume: number) {
        const player = playerRef.current;
        if (!player) return;

        if (newVolume === 0) {
            player.mute();
            toggleIsMuted(true);
        } else {
            player.unMute();
            toggleIsMuted(false);
        }

        setVolume(newVolume)
        localStorage.setItem("yousync-volume", String(newVolume));
        player.setVolume(newVolume);
    };

    function handleMute() {
        const player = playerRef.current;
        if (!player) return;

        if (player.isMuted()) {
            player.unMute();
            toggleIsMuted(false);
        } else {
            player.mute();
            toggleIsMuted(true);
        };
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
        const intervalID = window.setInterval(() => {
            if (!playerRef.current) return;
            if (newArrival.current) return;

            socket.emit("request-sync-check");
        }, 5_000);

        return () => {
            window.clearInterval(intervalID);
        };


    }, []);

    useEffect(() => {
        // governs the timeline
        const intervalID = setInterval(() => {
            const player = playerRef.current;
            if (!player) return;
            if (draggingTimeline.current) return;

            setCurrentTime(player.getCurrentTime());
        }, 1000);

        return () => window.clearInterval(intervalID);
    }, []);

    useEffect(() => {
        // despite the rework, invisible tabs are still wonky :'))))
        function handleInvisibility() {
            const visibility = document.visibilityState;
            const player = playerRef.current;

            if (!player) return;
            if (visibility === "visible" && player.isMuted()) {
                l("this happened");
                socket.emit("fetch-time");
            };

        };

        window.addEventListener("visibilitychange", handleInvisibility);

        return () => {
            window.removeEventListener("visibilitychange", handleInvisibility);
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
        <div>
            <div 
                // onClick={handlePlayerClick}
                style={{
                    position: "relative",
                    width: "640px",
                    height: "390px",
                    border: "5px dashed white",
                }}
            >
                <YouTube
                    videoId={videoID}
                    onReady={handleReady}
                    // onStateChange={(e) => console.log(e.data)} // enemy
                    opts={{
                        width: "640", 
                        height: "390", 
                        playerVars: { 
                            controls: 0,
                            disablekb: 1,
                            fs: 0,
                            playsinline: 1,
                            autoplay: 0,
                            loop: 0,
                        } 
                    }}
                />

                <div
                    onClick={handlePlayerClick}
                    style={{
                        position: "absolute",
                        inset: 0,
                        background: "transparent",
                        zIndex: 2,
                        border: "5px dashed white",
                        cursor: "pointer",
                }}>
                </div>


            </div>

            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-evenly",
                    border: "5px dashed white",
                    padding: "20px",
                }}
            >
                <div 
                    onClick={handlePlayerClick}
                    style={{
                        border: "2px solid gray",
                        padding: "5px 20px",
                        borderRadius: "20px",
                        cursor: "pointer",
                    }}    
                >
                    {isPlaying ? "⏸" : "▶"}
                </div>

                <div
                    style={{
                        display: "flex",
                        flexDirection: "row",
                    }}
                >
                    <div>{timeformat(currentTime)}</div>

                    <input 
                        type="range"
                        min={0}
                        max={duration}
                        step={0.1}
                        value={currentTime}
                        onChange={(e) => {
                            const time = Number(e.target.value);
                            setCurrentTime(time);
                        }}
                        onPointerDown={() => draggingTimeline.current = true}
                        onTouchStart={() => draggingTimeline.current = true}
                        onPointerUp={() => {
                            draggingTimeline.current = false;
                            handleSlider();
                        }}
                        onTouchEnd={() => {
                            draggingTimeline.current = false;
                            handleSlider();
                        }}
                    />

                    <div>{timeformat(duration)}</div>
                </div>


                {/* volume */}
                <div onClick={handleMute}>{ ( volume === 0 || isMuted) ? "🔇" : ( volume < 50 ) ? "🔉" : "🔊"}</div>
                <div> {}
                    <input 
                        type="range"
                        min={0}
                        max={100}
                        step={0.5}
                        value={volume}
                        onChange={(e) => {
                            const newVolume = Number(e.target.value);
                            changeVolume(newVolume);
                        }}
                    />
                </div>
                {/* volume end */}


                {/* fullscreen */}
                <button onClick={onToggleFullscreen}>⛶</button>
                {/* fullscreen end */}
            </div>
        </div>
    );

}

                            
export default VideoPlayer;