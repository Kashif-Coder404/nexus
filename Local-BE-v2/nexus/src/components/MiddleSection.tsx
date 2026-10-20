import React from "react";
import Device from "./Device";
import PairingCode from "./PairingCode";
import { Copy, NewCode } from "./Buttons";
import { ArrowUpRight } from "lucide-react";

const MiddleSection = () => {
  return (
    <div className="flex flex-col justify-center items-center flex-1 max-w-fit -translate-y-20">
      <Device />
      <PairingCode />
      <div className="flex justify-between items-center gap-2 w-full p-2">
        <button className="flex justify-center items-center">
          <span>Open Web App</span>
          <ArrowUpRight />
        </button>
        <div className="flex items-center gap-2">
          <NewCode />
          <Copy />
        </div>
      </div>
    </div>
  );
};

export default MiddleSection;
