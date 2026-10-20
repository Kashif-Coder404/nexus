import { Laptop } from "lucide-react";
import React from "react";

const Device = () => {
  return (
    <div className="flex m-2 items-center justify-center w-full">
      {/* ── Separate Icon & Text with clean spacing ── */}
      <div className="flex items-center gap-5 px-6 py-4 border-brand-border rounded-2xl">
        {/* Icon with comfortable padding */}
        <div className="border-2 border-brand rounded-full p-3 flex items-center justify-center shrink-0">
          <Laptop size={32} />
        </div>

        {/* Text with vertical space and distinct sizes */}
        <div className="flex flex-col gap-1 text-left">
          <h1 className="text-xl font-bold text-white tracking-wide">
            Device Name
          </h1>
          <h3 className="text-xs font-mono text-gray-400">
            device-id: 8f4a-9c2b
          </h3>
        </div>
      </div>

      <div className="flex gap-4 m-4">
        <div className="bg-green-700/50 border border-green-600 rounded-xl p-3 font-semibold">
          Ready To Pair
        </div>
        <div className="bg-yellow-700/50 border border-yellow-600 rounded-xl p-3 font-semibold">
          Pairing
        </div>
      </div>
    </div>
  );
};

export default Device;
