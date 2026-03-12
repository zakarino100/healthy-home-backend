import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

// GET /users
router.get("/", async (req, res) => {
  try {
    const { role, active } = req.query as Record<string, string | undefined>;
    const conditions: ReturnType<typeof eq>[] = [];

    if (role) conditions.push(eq(usersTable.role, role as typeof usersTable.role._.data));
    if (active !== undefined) conditions.push(eq(usersTable.active, active === "true"));

    const users = conditions.length > 0
      ? await db.select().from(usersTable).where(and(...conditions)).orderBy(usersTable.name)
      : await db.select().from(usersTable).orderBy(usersTable.name);

    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /users
router.post("/", async (req, res) => {
  try {
    const body = req.body;
    const [user] = await db.insert(usersTable).values({
      name: body.name,
      email: body.email ?? null,
      role: body.role ?? "canvasser",
      active: body.active ?? true,
    }).returning();
    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/:id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /users/:id
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body;
    const [user] = await db.update(usersTable)
      .set({
        name: body.name,
        email: body.email ?? null,
        role: body.role ?? "canvasser",
        active: body.active ?? true,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, id))
      .returning();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /users/:id — soft delete (deactivate)
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [user] = await db.update(usersTable)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
