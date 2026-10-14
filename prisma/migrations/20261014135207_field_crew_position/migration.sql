-- The Field crew starting position (src/lib/access.ts), for companies that already have their
-- positions — a company that hasn't opened Settings → Team yet gets it with the rest.
INSERT INTO "Position" ("id", "companyId", "name", "key", "access", "sortOrder", "createdAt", "updatedAt")
SELECT 'fieldcrew_' || c."id", c."id", 'Field crew', 'FIELD', '{"leads":0,"estimates":0,"takeoffs":0,"selections":0,"field":2,"files":1,"purchasing":0,"budget":0,"invoices":0,"reports":0,"time":0,"lists":0,"quickbooks":0,"jobs":"ALL","delay":false,"approveBills":false,"costs":false}',
       COALESCE((SELECT MAX(p."sortOrder") FROM "Position" p WHERE p."companyId" = c."id"), 0) + 1, NOW(), NOW()
FROM "Company" c
WHERE EXISTS (SELECT 1 FROM "Position" p WHERE p."companyId" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "Position" p WHERE p."companyId" = c."id" AND p."key" = 'FIELD');
