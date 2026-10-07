"use client";

import { useEffect, useState } from "react";

const EVENT = "geraicuan:pengaturan-result";

/**
 * L6: the Pengaturan cards save on their own, so one card's old "… disimpan" could sit beside
 * another card's newer error. Each card announces its answer; a card shows its success alert only
 * while no other card has answered since. Errors stay, since they are still true.
 */
export function useNewestSettingsResult(card: string, resultToken: string | undefined) {
  const [newest, setNewest] = useState<string | null>(null);
  useEffect(() => {
    const onResult = (event: Event) => setNewest((event as CustomEvent<string>).detail);
    window.addEventListener(EVENT, onResult);
    return () => window.removeEventListener(EVENT, onResult);
  }, []);
  useEffect(() => {
    if (resultToken) window.dispatchEvent(new CustomEvent(EVENT, { detail: card }));
  }, [card, resultToken]);
  return newest === null || newest === card;
}
