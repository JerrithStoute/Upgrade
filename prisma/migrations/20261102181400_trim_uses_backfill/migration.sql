-- Trim the takeoffs already use: each box (baseboard, casing, apron, lining) lists what it's been used for.
WITH used AS (
  SELECT "companyId", "type", "options"::jsonb AS o FROM "TakeoffCondition" WHERE "options" LIKE '{%' AND "type" IN ('WALL', 'DOOR', 'WINDOW')
  UNION ALL
  SELECT "companyId", "type", "options"::jsonb FROM "TakeoffTemplateCondition" WHERE "options" LIKE '{%' AND "type" IN ('WALL', 'DOOR', 'WINDOW')
), picks AS (
  SELECT "companyId", o->>'baseItem' AS item, 'base' AS use FROM used WHERE "type" = 'WALL'
  UNION ALL SELECT "companyId", o->>'casingItem', 'casing' FROM used WHERE "type" IN ('DOOR', 'WINDOW')
  UNION ALL SELECT "companyId", o->>'headItem', 'casing' FROM used WHERE "type" IN ('DOOR', 'WINDOW')
  UNION ALL SELECT "companyId", o->>'apronItem', 'apron' FROM used WHERE "type" = 'WINDOW'
  UNION ALL SELECT "companyId", o->>'liningItem', 'lining' FROM used WHERE "type" = 'WINDOW'
), keyed AS (
  SELECT DISTINCT "companyId", lower(regexp_replace(btrim(regexp_replace(item, '["''‘’“”′″]', '', 'g')), '\s+', ' ', 'g')) AS key, use
  FROM picks WHERE coalesce(btrim(item), '') <> ''
)
UPDATE "MaterialItem" m
SET "trimUses" = ARRAY(SELECT DISTINCT u FROM unnest(m."trimUses" || ARRAY(SELECT k.use FROM keyed k WHERE k."companyId" = m."companyId" AND k.key = m."nameKey")) AS u ORDER BY u)
WHERE EXISTS (SELECT 1 FROM keyed k WHERE k."companyId" = m."companyId" AND k.key = m."nameKey");
