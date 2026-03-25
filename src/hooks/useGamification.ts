"use client";

import { useState, useEffect } from "react";

export function useGamification() {
  const [enabled, setEnabled] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const saved = localStorage.getItem("gamification_enabled");
      if (saved !== null) {
        setEnabled(saved === "true");
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const toggleGamification = (value: boolean) => {
    setEnabled(value);
    try {
      localStorage.setItem("gamification_enabled", value.toString());
    } catch(e) {}
    window.dispatchEvent(new Event("gamification_changed"));
  };

  useEffect(() => {
    const handleStorage = () => {
      try {
        const saved = localStorage.getItem("gamification_enabled");
        if (saved !== null) {
          setEnabled(saved === "true");
        }
      } catch (e) {}
    };
    window.addEventListener("gamification_changed", handleStorage);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("gamification_changed", handleStorage);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return { enabled: isMounted ? enabled : true, toggleGamification };
}
