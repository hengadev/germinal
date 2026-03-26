ALTER TABLE "events" ADD COLUMN "location_en" varchar(500);
ALTER TABLE "events" ADD COLUMN "location_fr" varchar(500);
ALTER TABLE "events" ADD COLUMN "venue_name_en" varchar(200);
ALTER TABLE "events" ADD COLUMN "venue_name_fr" varchar(200);
ALTER TABLE "events" ADD COLUMN "street_address_en" varchar(255);
ALTER TABLE "events" ADD COLUMN "street_address_fr" varchar(255);
ALTER TABLE "events" ADD COLUMN "district_en" varchar(100);
ALTER TABLE "events" ADD COLUMN "district_fr" varchar(100);
ALTER TABLE "events" ADD COLUMN "city_en" varchar(100);
ALTER TABLE "events" ADD COLUMN "city_fr" varchar(100);
ALTER TABLE "events" ADD COLUMN "country_en" varchar(100);
ALTER TABLE "events" ADD COLUMN "country_fr" varchar(100);
--> statement-breakpoint
UPDATE "events" SET
  "location_en" = "location",
  "location_fr" = "location",
  "venue_name_en" = "venue_name",
  "venue_name_fr" = "venue_name",
  "street_address_en" = "street_address",
  "street_address_fr" = "street_address",
  "district_en" = "district",
  "district_fr" = "district",
  "city_en" = "city",
  "city_fr" = "city",
  "country_en" = "country",
  "country_fr" = "country";
--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "location_en" SET NOT NULL;
ALTER TABLE "events" ALTER COLUMN "location_fr" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "location";
ALTER TABLE "events" DROP COLUMN IF EXISTS "venue_name";
ALTER TABLE "events" DROP COLUMN IF EXISTS "street_address";
ALTER TABLE "events" DROP COLUMN IF EXISTS "district";
ALTER TABLE "events" DROP COLUMN IF EXISTS "city";
ALTER TABLE "events" DROP COLUMN IF EXISTS "country";
