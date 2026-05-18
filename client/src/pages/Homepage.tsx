import { useNavigate, useLocation } from "react-router-dom";
import socket from "../socket.ts";
import { useEffect } from "react";

function Homepage() {
  const navigate = useNavigate();
  const location = useLocation();
  const error = location.state?.error;

  const joinClick = (): void => {
    navigate("/watch/test123");
  }

  const createClick = (): void => {
    socket.emit("create-session");
  } 

  useEffect(() => {
    
    socket.on("session-created", (sessionId: string) => {
      navigate(`/watch/${sessionId}`);
    })

    return () => {
      socket.off("session-created");
    }
  }, []);
  


  return (
      <div>
        {error && <p style={{ color: "red" }}>{error}</p>}
          <button onClick={joinClick}>Join Session</button>
          <button onClick={createClick}>Create Session</button>
      </div>
  );
}

export default Homepage;