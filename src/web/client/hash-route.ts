/**
 * Minimal hash-based router. No dependency on react-router-dom — the app has
 * exactly two routes (viewer at `#/`, library at `#/library`). Hash routing
 * is also dev-server-friendly: no need for server-side rewrites.
 *
 * In-flight decision: hash routing over react-router-dom. Reason: dependency
 * weight not justified for 2 routes; can swap to a real router in a later
 * slice if route count grows.
 */

import { useEffect, useState } from "react";

export type Route =
  | { name: "viewer" }
  | { name: "library" };

function parseHash(hash: string): Route {
  // Normalize: drop leading "#", trailing slashes, query.
  const clean = hash.replace(/^#/, "").split("?")[0] ?? "";
  if (clean === "/library" || clean === "library" || clean.startsWith("/library")) {
    return { name: "library" };
  }
  return { name: "viewer" };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(typeof window !== "undefined" ? window.location.hash : ""),
  );

  useEffect(() => {
    function onHashChange(): void {
      setRoute(parseHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}
