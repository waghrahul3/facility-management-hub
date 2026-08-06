import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { suppliers } from "../../db/schema.js";
import { asyncHandler, notFound } from "../../lib/errors.js";
import { mySupplierId } from "./_shared.js";

const router = Router();

router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const supplier = (
      await db.select().from(suppliers).where(eq(suppliers.id, mySupplierId(req))).limit(1)
    )[0];
    if (!supplier) throw notFound("Supplier profile not found");
    return res.json({ supplier });
  })
);

router.put(
  "/profile",
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(suppliers).where(eq(suppliers.id, mySupplierId(req))).limit(1)
    )[0];
    if (!existing) throw notFound("Supplier profile not found");

    const { name, phone, email, contact_person, address, city } = req.body ?? {};
    const [updated] = await db
      .update(suppliers)
      .set({
        name: name ?? existing.name,
        phone: phone !== undefined ? phone : existing.phone,
        email: email !== undefined ? email : existing.email,
        contact_person: contact_person !== undefined ? contact_person : existing.contact_person,
        address: address !== undefined ? address : existing.address,
        city: city !== undefined ? city : existing.city,
        updated_at: new Date(),
      })
      .where(eq(suppliers.id, existing.id))
      .returning();
    return res.json({ supplier: updated });
  })
);

export default router;
