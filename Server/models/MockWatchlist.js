/* ----------------------------------------
   MockWatchlist — in-memory store
---------------------------------------- */

const watchlists = [];
let nextId = 1;

export const Watchlist = {
  async find({ userId }) {
    return watchlists
      .filter(w => w.userId === String(userId))
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  async create({ userId, name, symbols }) {
    const watchlist = {
      _id: String(nextId++),
      userId: String(userId),
      name,
      symbols,
      createdAt: new Date()
    };
    watchlists.push(watchlist);
    return watchlist;
  },

  async findOneAndDelete({ _id, userId }) {
    const index = watchlists.findIndex(
      w => w._id === String(_id) && w.userId === String(userId)
    );
    if (index === -1) return null;
    return watchlists.splice(index, 1)[0];
  }
};