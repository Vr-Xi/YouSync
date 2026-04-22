import { useNavigate } from "react-router-dom";

function Homepage() {
  const navigate = useNavigate();

  const joinClick = (): void => {
    navigate("/watch/test123");
  }

  const createClick = (): void => {
    const randomId: string = Math.random().toString(36).substring(2, 8);
    navigate(`/watch/${randomId}`);
  } 
  


  return (
      <div>
          <button onClick={joinClick}>Join Session</button>
          <button onClick={createClick}>Create Session</button>
      </div>
  );
}

export default Homepage;