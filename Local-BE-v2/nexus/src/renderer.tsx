import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import Navbar from "./components/Navbar";
import MiddleSection from "./components/MiddleSection";

const App = () => {
  return (
    <div className="flex flex-col min-h-screen w-screen">
      <Navbar />
      <div className="flex-1 flex justify-center items-center pb-20">
        <MiddleSection />
      </div>
    </div>
  );
};

// Mount React to <div id="root"> inside index.html
const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
