import express from "express";
import { Portfolio } from "../models/Portfolio.js";
import { authMiddleware } from "../utils/authMiddleware.js";

const router = express.Router();

// All routes require auth
router.use(authMiddleware);

/* -------------------------
   GET /api/portfolios
   Get all portfolios for logged-in user
--------------------------*/
router.get("/", async (req, res) => {
  try {
    const portfolios = await Portfolio.find({ userId: req.user.userId })
      .sort({ createdAt: -1 });
    res.json(portfolios);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch portfolios" });
  }
});

/* -------------------------
   POST /api/portfolios
   Save a new portfolio
--------------------------*/
router.post("/", async (req, res) => {
  try {
    const { name, stocks } = req.body;

    if (!name || !stocks?.length)
      return res.status(400).json({ error: "Name and stocks are required" });

    const totalWeight = stocks.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight > 1.01)
      return res.status(400).json({ error: "Total weight cannot exceed 100%" });

    const portfolio = await Portfolio.create({
      userId: req.user.userId,
      name,
      stocks
    });

    res.status(201).json(portfolio);
  } catch (err) {
    res.status(500).json({ error: "Failed to save portfolio" });
  }
});

/* -------------------------
   DELETE /api/portfolios/:id
   Delete a portfolio
--------------------------*/
router.delete("/:id", async (req, res) => {
  try {
    const portfolio = await Portfolio.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId // ensure user owns it
    });

    if (!portfolio)
      return res.status(404).json({ error: "Portfolio not found" });

    res.json({ message: "Portfolio deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete portfolio" });
  }
});

export default router;