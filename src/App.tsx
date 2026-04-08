import './App.css';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Homepage from "./pages/Homepage";
import WatchRoom from "./pages/WatchRoom";

function App() {


  return (
    <Router>
      <Routes>
        <Route>
          <Route path="/" element={<Homepage />}></Route>
          <Route path="/watch/:sessionID" element={<WatchRoom />}></Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
