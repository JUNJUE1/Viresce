import mongoose from "mongoose";

const watchlistSchema = new mongoose.Schema({
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
  symbols: [
    {
      type: String,
      uppercase: true
    }
  ]
}, { timestamps: true });

export const Watchlist = mongoose.model("Watchlist", watchlistSchema);