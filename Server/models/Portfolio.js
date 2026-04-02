import mongoose from "mongoose";

const portfolioSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60
  },
  stocks: [
    {
      symbol: { type: String, required: true, uppercase: true },
      weight: { type: Number, required: true, min: 0, max: 1 }
    }
  ]
}, { timestamps: true });

export const Portfolio = mongoose.model("Portfolio", portfolioSchema);