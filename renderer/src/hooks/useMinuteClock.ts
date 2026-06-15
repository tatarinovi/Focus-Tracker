import { useEffect, useState } from "react";

/** Текущее время; обновляется на границе каждой минуты и при возврате во вкладку. */
export function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const update = () => setNow(new Date());
    update();

    let intervalId: ReturnType<typeof setInterval>;
    const delay = 60_000 - (Date.now() % 60_000) + 50;

    const timeoutId = setTimeout(() => {
      update();
      intervalId = setInterval(update, 60_000);
    }, delay);

    const onVisibility = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return now;
}
