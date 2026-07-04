import './App.css';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Homepage from "./pages/Homepage";
import WatchRoom from "./pages/WatchRoom";
import NotFound from "./pages/NotFound.tsx";

function App() {


  return (
    <Router>
      <Routes>
          <Route path="/" element={<Homepage />}></Route>
          <Route path="/watch/:sessionID" element={<WatchRoom />}></Route>
          <Route path="*" element={<NotFound />}></Route>
          <Route path="not-found" element={<NotFound />}></Route>
      </Routes>
    </Router>
  );
}

export default App;
