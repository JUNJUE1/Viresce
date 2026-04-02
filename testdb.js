import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

console.log("Attempting to connect to:", process.env.MONGODB_URI?.replace(/:.*@/, ":***@"));

mongoose.connect(process.env.MONGODB_URI, { family: 4 })
  .then(() => {
    console.log("✅ Connected successfully!");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ Failed:", err.message);
    process.exit(1);
  });