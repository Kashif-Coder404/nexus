import { ArrowUpToLine, Download } from "lucide-react";
import React from "react";

const Navbar = () => {
  return (
    <div className="flex justify-between items-center m-2">
      <div>
        <div className="flex justify-center items-center gap-2">
          <img
            src="../assets/nexus-main-icon.png"
            alt="nexus icon"
            width={60}
            height={60}
          />
          <h1 className="text-xl font-medium">Nexus Desktop</h1>
        </div>
      </div>
      {/* <div>Middle Links</div> */}
      <div>
        <button className="flex justify-center items-center gap-2 border border-gray-600 px-2 py-1 rounded-xl">
          <Download width={20} />
          <span className="font-medium">Update Nexus</span>
        </button>
      </div>
    </div>
  );
};

export default Navbar;
