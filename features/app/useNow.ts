"use client";

import { useEffect, useState } from "react";

/** A clock for screens that reveal scripted sim lines or count down (4 Hz is plenty for a 1 s timer). */
export function useNow(ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}
