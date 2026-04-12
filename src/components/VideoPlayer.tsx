import { useEffect, useRef } from "react";

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

    useEffect(() => {

        const initPlayer = () => {
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

        return () => {
            playerInstance.current?.destroy?.();
            playerInstance.current = null;
        }
    }, [video]);

    return <div ref={playerNode}></div>

}

export default VideoPlayer;