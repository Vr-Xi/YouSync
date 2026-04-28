import { useNavigate } from "react-router-dom";
import socket from "../socket.ts";

function Homepage() {
  const navigate = useNavigate();

  const joinClick = (): void => {
    navigate("/watch/test123");
  }

  const createClick = (): void => {
    socket.emit("create-session");
    const randomId: string = Math.random().toString(36).substring(2, 8);
    navigate(`/watch/${randomId}`);
  } 

  socket.on("session-created", (sessionId: string) => {
    navigate(`/watch/${sessionId}`);
  })
  


  return (
      <div>
          <button onClick={joinClick}>Join Session</button>
          <button onClick={createClick}>Create Session</button>
      </div>
  );
}

export default Homepage;