import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc, or, sql } from "drizzle-orm";

const router: IRouter = Router();

// GET /tasks?status=&assignedTo=&dueAfter=&dueBefore=&relatedToType=&relatedToId=
router.get("/", async (req, res) => {
  try {
    const { status, assignedTo, dueAfter, dueBefore, relatedToType, relatedToId } = req.query as Record<string, string | undefined>;
    const conditions = [];
    if (status) conditions.push(eq(tasksTable.status, status));
    if (assignedTo) conditions.push(eq(tasksTable.assignedTo, assignedTo));
    if (dueAfter) conditions.push(gte(tasksTable.dueDate, dueAfter));
    if (dueBefore) conditions.push(lte(tasksTable.dueDate, dueBefore));
    if (relatedToType) conditions.push(eq(tasksTable.relatedToType, relatedToType));
    if (relatedToId) conditions.push(eq(tasksTable.relatedToId, relatedToId));

    const rows = conditions.length > 0
      ? await db.select().from(tasksTable).where(and(...conditions)).orderBy(tasksTable.dueDate, desc(tasksTable.createdAt))
      : await db.select().from(tasksTable).orderBy(tasksTable.dueDate, desc(tasksTable.createdAt));

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /tasks/:id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /tasks
router.post("/", async (req, res) => {
  try {
    const body = req.body;
    if (!body.title) return res.status(400).json({ error: "title is required" });
    const [task] = await db.insert(tasksTable).values({
      title: body.title,
      description: body.description ?? null,
      relatedToType: body.relatedToType ?? null,
      relatedToId: body.relatedToId ? String(body.relatedToId) : null,
      dueDate: body.dueDate ?? null,
      status: body.status ?? "pending",
      priority: body.priority ?? "normal",
      assignedTo: body.assignedTo ?? null,
      createdBy: body.createdBy ?? null,
      syncSource: body.syncSource ?? "dashboard",
      updatedBy: body.updatedBy ?? null,
    }).returning();
    res.status(201).json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /tasks/:id
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body;
    const update: Record<string, any> = { updatedAt: new Date() };
    if (body.title !== undefined) update.title = body.title;
    if (body.description !== undefined) update.description = body.description;
    if (body.relatedToType !== undefined) update.relatedToType = body.relatedToType;
    if (body.relatedToId !== undefined) update.relatedToId = body.relatedToId ? String(body.relatedToId) : null;
    if (body.dueDate !== undefined) update.dueDate = body.dueDate;
    if (body.status !== undefined) {
      update.status = body.status;
      if (body.status === "completed") update.completedAt = new Date();
    }
    if (body.priority !== undefined) update.priority = body.priority;
    if (body.assignedTo !== undefined) update.assignedTo = body.assignedTo;
    if (body.updatedBy !== undefined) update.updatedBy = body.updatedBy;

    const [task] = await db.update(tasksTable).set(update).where(eq(tasksTable.id, id)).returning();
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /tasks/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(tasksTable).where(eq(tasksTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
