/* ----------------------------------------
   MockUser — in-memory store
   Drop-in replacement for models/User.js
   No MongoDB needed. Data resets on restart.
---------------------------------------- */

const users = []; // in-memory store
let nextId = 1;

export const User = {
  async findOne(query) {
    if (query.$or) {
      return users.find(u =>
        query.$or.some(condition => {
          const [key, val] = Object.entries(condition)[0];
          return u[key] === val;
        })
      ) || null;
    }
    const [key, val] = Object.entries(query)[0];
    return users.find(u => u[key] === val) || null;
  },

  async findById(id) {
    return users.find(u => u._id === String(id)) || null;
  },

  async create({ username, email, passwordHash }) {
    const user = {
      _id: String(nextId++),
      username,
      email,
      passwordHash,
      createdAt: new Date()
    };
    users.push(user);
    return user;
  },

  // Mimic .select("-passwordHash")
  async findByIdSafe(id) {
    const user = users.find(u => u._id === String(id));
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return safe;
  }
};