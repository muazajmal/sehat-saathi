"use client";

import { useCallback, useEffect, useState } from "react";
import { session, type SessionInfo } from "./api";

/** The logged-in account on this device (or null). Updates across tabs. */
export function useSession() {
  const [s, setS] = useState<SessionInfo | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setS(session.get());
    setReady(true);
    const onStorage = () => setS(session.get());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const save = useCallback((v: SessionInfo | null) => {
    session.set(v);
    setS(v);
  }, []);
  const logout = useCallback(() => save(null), [save]);
  return { session: s, ready, save, logout };
}
