import { useNavigate } from "react-router-dom";

export default function NotFound() {
    const navigate = useNavigate();

    function goHome() {
        navigate("/")
    };


    return (
        <div>
            <h1>Page not found</h1>
            <div>This room may not exist, may have expired, or may be unavailable.</div>
            <button onClick={goHome}>Go Home</button>
        </div>
    );
}