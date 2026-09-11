'use client';

/**
 * Loaded portrait images, shared by the 2D board and the 3D table.
 *
 * One cache for both because they draw the same faces at the same moment,
 * and two caches would be two network fetches of one file. Keyed by URL,
 * which is the portrait route for an upload or the remote address for a
 * link — either way the server already decided the viewer may look.
 */
import { useEffect, useState } from 'react';

const cache = new Map<string, Promise<HTMLImageElement | null>>();

export function loadPortrait(url: string): Promise<HTMLImageElement | null> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise(resolve => {
      const img = new Image();
      // Same-origin uploads and allow-listed remotes alike; a remote that
      // refuses CORS still draws on a 2D canvas (it only taints it) but not
      // into a WebGL texture, so ask and fall back to initials if refused.
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

/**
 * The images for a set of URLs, as they arrive. Re-renders once per load so a
 * board with five portraits paints faces one by one rather than all at once
 * or never.
 */
export function usePortraits(urls: string[]): Map<string, HTMLImageElement> {
  const [loaded, setLoaded] = useState<Map<string, HTMLImageElement>>(
    () => new Map()
  );
  const key = urls.slice().sort().join('\n');

  useEffect(() => {
    let live = true;
    for (const url of key ? key.split('\n') : []) {
      loadPortrait(url).then(img => {
        if (!live || !img) return;
        setLoaded(prev => {
          if (prev.get(url) === img) return prev;
          const next = new Map(prev);
          next.set(url, img);
          return next;
        });
      });
    }
    return () => {
      live = false;
    };
  }, [key]);

  return loaded;
}
