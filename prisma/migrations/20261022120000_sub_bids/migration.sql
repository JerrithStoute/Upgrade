-- Send to subs: a bid for whole trades from the plans (one price per cost code), with a due date and the plans shared.
ALTER TABLE "Bid" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'MATERIAL',
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "planFileIds" TEXT;
