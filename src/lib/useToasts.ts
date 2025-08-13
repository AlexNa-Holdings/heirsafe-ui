import { useState } from "react";

export type Toast = { id: number; kind: "success" | "error" | "info"; msg: string };

export function useToasts() {
  const [list, setList] = useState<Toast[]>([]);
  function push(msg: string, kind: Toast["kind"] = "info", ttl = 4000) {
    const id = Date.now() + Math.random();
    setList((xs) => [...xs, { id, kind, msg }]);
    setTimeout(() => setList((xs) => xs.filter((t) => t.id !== id)), ttl);
  }
  return { toasts: list, push };
}
