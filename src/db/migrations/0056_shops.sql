-- A shop (improvements 09).
--
-- A place the party buys and sells. Stock rows point at content — an SRD
-- item, or a homebrew item the campaign has in play (content-model rule 6) —
-- and the stats are resolved when read; only the name is kept beside the ref,
-- the denormalisation rule 1 allows. `price_cp` NULL means the item's book
-- cost with the shop's markup; `quantity` NULL means the shelf never empties.
-- `buy` and `sell` in `server/shops.ts` move coin and rows in one transaction
-- and write one history line each.

CREATE TABLE "campaign_shops" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL DEFAULT '',
  "blurb" TEXT NOT NULL DEFAULT '',
  "markup_percent" INTEGER NOT NULL DEFAULT 0,
  "buys_at_percent" INTEGER NOT NULL DEFAULT 50,
  "visibility" TEXT NOT NULL DEFAULT 'dm' CHECK ("visibility" IN ('dm', 'shared')),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "campaign_shops_campaign_idx" ON "campaign_shops" ("campaign_id");

CREATE TABLE "campaign_shop_stock" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "shop_id" TEXT NOT NULL REFERENCES "campaign_shops"("id") ON DELETE CASCADE,
  "content_source" TEXT NOT NULL,
  "content_key" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "price_cp" INTEGER,
  "quantity" INTEGER,
  "sort_order" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "campaign_shop_stock_shop_idx" ON "campaign_shop_stock" ("shop_id");
