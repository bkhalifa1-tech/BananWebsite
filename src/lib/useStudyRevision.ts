import { useEffect, useState } from "react";
/** Refresh derived views after successful mutations in the relevant resources. */
export function useStudyRevision(resourcePattern: string) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const pattern = new RegExp(resourcePattern);
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string }>).detail;
      if (detail && pattern.test(detail.path)) setRevision((n) => n + 1);
    };
    window.addEventListener("study-data-changed", changed);
    return () => window.removeEventListener("study-data-changed", changed);
  }, [resourcePattern]);
  return revision;
}
