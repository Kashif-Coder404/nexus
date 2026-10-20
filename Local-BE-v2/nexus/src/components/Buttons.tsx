import { CopyCheck, RefreshCcw } from "lucide-react";
import React from "react";

const Copy = () => {
  return (
    <button className="flex justify-center items-center p-2 border-2 border-brand bg-brand-border/30 hover:bg-brand/60 duration-300 gap-2 rounded-xl text-xs font-medium">
      <CopyCheck />
      Copy Code
    </button>
  );
};
const NewCode = () => {
  return (
    <button className="flex justify-center items-center p-2 border-2 border-brand bg-brand-border/30 hover:bg-brand/60 duration-300 gap-2 rounded-xl text-xs font-medium">
      <RefreshCcw />
      New Code
    </button>
  );
};
export { Copy, NewCode };
