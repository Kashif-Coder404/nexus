import { Clock } from "lucide-react";
import React from "react";

const PairCodeBox = ({ code }: { code: string }) => {
  return (
    <div className="border-2 bg-linear-to-r from-brand/15 border-brand rounded-2xl h-20 w-20 flex justify-center items-center text-4xl">
      {code}
    </div>
  );
};
const tempCode = "NX1234";
const PairingCode = () => {
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="flex items-center justify-center py-5 px-3 gap-2">
        {tempCode.split("").map((code: string) => {
          return <PairCodeBox code={code} />;
        })}
      </div>
      <div className="w-full flex justify-end items-center gap-3 px-3">
        <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono">
          <Clock size={16} /> 4:50s
        </div>
        <progress
          value={50}
          max={100}
          className="h-2.5 w-36 overflow-hidden rounded-full"
        />
      </div>
    </div>
  );
};

export default PairingCode;
