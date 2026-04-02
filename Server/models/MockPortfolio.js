/* ----------------------------------------
   MockPortfolio — in-memory store
---------------------------------------- */

const portfolios = [];
let nextId = 1;

export const Portfolio = {
  async find({ userId }) {
    return portfolios
      .filter(p => p.userId === String(userId))
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  async create({ userId, name, stocks }) {
    const portfolio = {
      _id: String(nextId++),
      userId: String(userId),
      name,
      stocks,
      createdAt: new Date()
    };
    portfolios.push(portfolio);
    return portfolio;
  },

  async findOneAndDelete({ _id, userId }) {
    const index = portfolios.findIndex(
      p => p._id === String(_id) && p.userId === String(userId)
    );
    if (index === -1) return null;
    return portfolios.splice(index, 1)[0];
  }
};