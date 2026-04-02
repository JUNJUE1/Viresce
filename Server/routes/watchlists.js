import express from "express";
import { Watchlist } from "../models/Watchlist.js";
import { authMiddleware } from "../utils/authMiddleware.js";

const router = express.Router();

router.use(authMiddleware);

/* -------------------------
   GET /api/watchlists
--------------------------*/
router.get("/", async (req, res) => {
  try {
    const watchlists = await Watchlist.find({ userId: req.user.userId })
      .sort({ createdAt: -1 });
    res.json(watchlists);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch watchlists" });
  }
});

/* -------------------------
   POST /api/watchlists
--------------------------*/
router.post("/", async (req, res) => {
  try {
    const { name, symbols } = req.body;

    if (!name || !symbols?.length)
      return res.status(400).json({ error: "Name and symbols are required" });

    const watchlist = await Watchlist.create({
      userId: req.user.userId,
      name,
      symbols
    });

    res.status(201).json(watchlist);
  } catch (err) {
    res.status(500).json({ error: "Failed to save watchlist" });
  }
});

/* -------------------------
   DELETE /api/watchlists/:id
--------------------------*/
router.delete("/:id", async (req, res) => {
  try {
    const watchlist = await Watchlist.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!watchlist)
      return res.status(404).json({ error: "Watchlist not found" });

    res.json({ message: "Watchlist deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete watchlist" });
  }
});

export default router;