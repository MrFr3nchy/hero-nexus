import { permanentRedirect } from 'next/navigation';

/**
 * "Market" was the wrong word: nothing here is bought or sold. The shelf lives
 * at `/library` now, and this stays so that a bookmark, a link in someone's
 * notes or a nav item cached in a browser still lands somewhere real.
 */
export default function MarketplacePage() {
  permanentRedirect('/library');
}
