import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { jobContentTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// GET /content/:jobId
router.get("/:jobId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const [content] = await db.select().from(jobContentTable).where(eq(jobContentTable.jobId, jobId));
    if (!content) return res.status(404).json({ error: "Content record not found" });
    res.json(content);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /content/:jobId
router.put("/:jobId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const body = req.body;

    // Upsert
    const [existing] = await db.select().from(jobContentTable).where(eq(jobContentTable.jobId, jobId));

    if (!existing) {
      const [content] = await db.insert(jobContentTable).values({
        jobId,
        beforePhotos: body.beforePhotos ?? null,
        afterPhotos: body.afterPhotos ?? null,
        videoCapture: body.videoCapture ?? false,
        contentReady: body.contentReady ?? false,
        reviewScreenshot: body.reviewScreenshot ?? false,
        notes: body.notes ?? null,
      }).returning();
      return res.json(content);
    }

    const [content] = await db.update(jobContentTable)
      .set({
        beforePhotos: body.beforePhotos ?? null,
        afterPhotos: body.afterPhotos ?? null,
        videoCapture: body.videoCapture ?? false,
        contentReady: body.contentReady ?? false,
        reviewScreenshot: body.reviewScreenshot ?? false,
        notes: body.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(jobContentTable.jobId, jobId))
      .returning();

    res.json(content);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
