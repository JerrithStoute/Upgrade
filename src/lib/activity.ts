import { db } from "./db";

/** Record an entry in the activity feed. Never throws. */
export async function logActivity(input: { projectId?: string | null; userId?: string | null; type: string; description: string }) {
  try {
    await db.activity.create({
      data: {
        projectId: input.projectId ?? null,
        userId: input.userId ?? null,
        type: input.type,
        description: input.description,
      },
    });
  } catch (err) {
    console.error("activity log failed", err);
  }
}
