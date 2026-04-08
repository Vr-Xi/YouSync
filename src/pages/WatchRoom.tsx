import { useParams } from "react-router-dom";

function WatchRoom() {
    const { sessionID } = useParams();
    return (
        <h1>Watch Room - Session ID: {sessionID} </h1>
    );
}

export default WatchRoom;