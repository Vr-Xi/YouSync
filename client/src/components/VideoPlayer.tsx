import { useEffect, useRef, useState } from "react";
import socket from "../socket.ts"

declare global {
    interface Window {
        YT: any,
        onYouTubeIframeAPIReady: () => void,
    }
}

type Props = {
    video?: string;
}


const VideoPlayer = ({ video }: Props) => {
    const playerNode = useRef<HTMLDivElement | null>(null);
    const playerInstance = useRef<any>(null);
    const [ videoStorage, changeVideo ] = useState<string>(video);

    useEffect(() => {

        const initPlayer = () => {
            if(!playerNode.current) return;

            playerInstance.current = new window.YT.Player(playerNode.current, {
                height: "390",
                width: "640",
                videoId: video ? video : "2H0r81kv5GA", //example
                events: {
                    onReady: () => console.log("Player ready"),
                    onStateChange: (event: any) => console.log("State change", event.data),
                },
            });
        };


        if (window.YT && window.YT.Player) {
            initPlayer();
        } else  {
            const tag = document.createElement("script");
            tag.src = "https://www.youtube.com/iframe_api";
            window.onYouTubeIframeAPIReady = initPlayer;
            document.body.appendChild(tag);
        }

        // socket actions
        socket.on("load-order", (toLoad: string) => {
            if (toLoad !== videoStorage) changeVideo(toLoad);
        })
        //

        return () => {
            playerInstance.current?.destroy?.();
            playerInstance.current = null;

            socket.off("load-order");
        }
    }, []);

    useEffect(() => {
        if (playerInstance.current && videoStorage !== "") {
            playerInstance.current.loadVideoById(videoStorage);
            socket.emit("load-request", videoStorage);
        }
    }, [videoStorage]);

    useEffect(() => {
        changeVideo(video);
    }, [video]);

    return <div ref={playerNode}></div>

}

export default VideoPlayer;