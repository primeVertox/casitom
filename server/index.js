const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { nanoid } = require('nanoid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

app.use(cors());
app.use(express.json());

const dbFile = path.join(__dirname, 'db.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { users: [] });

async function initDb() {
  await db.read();
  db.data ||= { users: [] };
  await db.write();
}

initDb();

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

async function findUserByEmail(email) {
  await db.read();
  return db.data.users.find((u) => u.email === email);
}

async function getUserById(id) {
  await db.read();
  return db.data.users.find((u) => u.id === id);
}

app.post('/api/auth/register', async (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email et mot de passe requis.' });
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    return res.status(400).json({ message: 'Compte déjà existant.' });
  }

  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: nanoid(),
    email,
    username: username || email.split('@')[0],
    passwordHash: hash,
    balance: 1000,
    stats: {
      sessions: 0,
      wins: 0,
      losses: 0,
      totalWagered: 0,
      biggestWin: 0,
      netProfit: 0,
    },
    settings: {
      masterVolume: 0.5,
    },
  };

  await db.read();
  db.data.users.push(user);
  await db.write();

  const token = createToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      balance: user.balance,
      stats: user.stats,
      settings: user.settings,
    },
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(400).json({ message: 'Identifiants invalides.' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(400).json({ message: 'Identifiants invalides.' });
  }

  const token = createToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      balance: user.balance,
      stats: user.stats,
      settings: user.settings,
    },
  });
});

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Non authentifié.' });

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Token invalide.' });
  }
}

app.get('/api/me', authMiddleware, async (req, res) => {
  await db.read();
  const user = db.data.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });
  res.json({
    id: user.id,
    email: user.email,
    username: user.username,
    balance: user.balance,
    stats: user.stats,
    settings: user.settings,
  });
});

app.post('/api/settings', authMiddleware, async (req, res) => {
  const { settings } = req.body;
  const user = await getUserById(req.userId);
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });

  user.settings = { ...user.settings, ...settings };
  await db.write();
  res.json({ settings: user.settings });
});

function applyLoss(user, wager) {
  user.balance -= wager;
  user.stats.losses += 1;
  user.stats.totalWagered += wager;
  user.stats.sessions += 1;
  user.stats.netProfit -= wager;
}

function applyWin(user, wager, profit, label) {
  const totalWin = wager + profit;
  user.balance += totalWin;
  user.stats.wins += 1;
  user.stats.totalWagered += wager;
  user.stats.sessions += 1;
  user.stats.netProfit += profit;
  if (totalWin > user.stats.biggestWin) {
    user.stats.biggestWin = totalWin;
  }
}

async function requireWager(req, res) {
  const { wager } = req.body;
  if (typeof wager !== 'number' || !Number.isFinite(wager) || wager <= 0) {
    res.status(400).json({ message: 'Mise invalide.' });
    return null;
  }
  const user = await getUserById(req.userId);
  if (!user) {
    res.status(404).json({ message: 'Utilisateur introuvable.' });
    return null;
  }
  if (user.balance < wager) {
    res.status(400).json({ message: 'Solde insuffisant.' });
    return null;
  }
  return { user, wager };
}

app.post('/api/games/crash/play', authMiddleware, async (req, res) => {
  const context = await requireWager(req, res);
  if (!context) return;
  const { user, wager } = context;

  const crashed = Math.random() < 0.5;
  let profit = 0;

  if (crashed) {
    applyLoss(user, wager);
  } else {
    const multiplier = 1 + Math.random() * 3;
    const totalMultiplier = Math.round(multiplier * 100) / 100;
    profit = Math.round(wager * totalMultiplier);
    applyWin(user, wager, profit, 'crash');
  }

  await db.write();

  res.json({
    game: 'crash',
    crashed,
    multiplier: crashed ? 0 : undefined,
    profit,
    balance: user.balance,
    stats: user.stats,
    summary: crashed
      ? `Le vol a crash, tu perds ${wager} IC.`
      : `Tu encaisses +${profit} IC sur Crash !`,
  });
});

app.post('/api/games/dice/play', authMiddleware, async (req, res) => {
  const context = await requireWager(req, res);
  if (!context) return;
  const { user, wager } = context;

  const roll = Math.floor(Math.random() * 100) + 1;
  const target = 50;
  const win = roll > target;
  let profit = 0;

  if (win) {
    profit = Math.round(wager * 0.95); // house edge
    applyWin(user, wager, profit, 'dice');
  } else {
    applyLoss(user, wager);
  }

  await db.write();

  res.json({
    game: 'dice',
    roll,
    target,
    win,
    profit,
    balance: user.balance,
    stats: user.stats,
    summary: win
      ? `Dice: ${roll} > ${target}, tu gagnes +${profit} IC.`
      : `Dice: ${roll} ≤ ${target}, tu perds ${wager} IC.`,
  });
});

app.post('/api/games/mines/play', authMiddleware, async (req, res) => {
  const context = await requireWager(req, res);
  if (!context) return;
  const { user, wager } = context;

  const safe = Math.random() < 0.7;
  let profit = 0;

  if (safe) {
    profit = Math.round(wager * 1.3);
    applyWin(user, wager, profit, 'mines');
  } else {
    applyLoss(user, wager);
  }

  await db.write();

  res.json({
    game: 'mines',
    safe,
    profit,
    balance: user.balance,
    stats: user.stats,
    summary: safe
      ? `Mines: tu évites les bombes, +${profit} IC.`
      : `Mines: BOOM, tu perds ${wager} IC.`,
  });
});

app.post('/api/games/roulette/play', authMiddleware, async (req, res) => {
  const context = await requireWager(req, res);
  if (!context) return;
  const { user, wager } = context;

  const { bet } = req.body; // 'red' | 'black'
  const number = Math.floor(Math.random() * 37); // 0-36
  const isRed = number !== 0 && number % 2 === 0;
  const color = number === 0 ? 'green' : isRed ? 'red' : 'black';

  const win = bet === color && color !== 'green';
  let profit = 0;

  if (win) {
    profit = wager; // 2x total
    applyWin(user, wager, profit, 'roulette');
  } else {
    applyLoss(user, wager);
  }

  await db.write();

  res.json({
    game: 'roulette',
    number,
    color,
    bet,
    win,
    profit,
    balance: user.balance,
    stats: user.stats,
    summary: win
      ? `Roulette: ${number} ${color}, tu gagnes +${profit} IC.`
      : `Roulette: ${number} ${color}, tu perds ${wager} IC.`,
  });
});

app.post('/api/games/stonks/play', authMiddleware, async (req, res) => {
  const context = await requireWager(req, res);
  if (!context) return;
  const { user, wager } = context;

  const up = Math.random() < 0.55;
  const changePercent = up
    ? 10 + Math.random() * 90
    : 5 + Math.random() * 40;
  const rounded = Math.round(changePercent * 10) / 10;

  let profit = 0;
  if (up) {
    profit = Math.round(wager * (rounded / 100));
    applyWin(user, wager, profit, 'stonks');
  } else {
    applyLoss(user, wager);
  }

  await db.write();

  res.json({
    game: 'stonks',
    direction: up ? 'up' : 'down',
    changePercent: rounded,
    profit,
    balance: user.balance,
    stats: user.stats,
    summary: up
      ? `Stonks: +${rounded}%, tu gagnes +${profit} IC.`
      : `Stonks: -${rounded}%, tu perds ${wager} IC.`,
  });
});

app.post('/api/games/crossy/play', authMiddleware, async (req, res) => {
  const context = await requireWager(req, res);
  if (!context) return;
  const { user, wager } = context;

  const success = Math.random() < 0.6;
  let profit = 0;

  if (success) {
    profit = Math.round(wager * 0.8);
    applyWin(user, wager, profit, 'crossy');
  } else {
    applyLoss(user, wager);
  }

  await db.write();

  res.json({
    game: 'crossy',
    success,
    profit,
    balance: user.balance,
    stats: user.stats,
    summary: success
      ? `Crossy: tu traverses la route, +${profit} IC.`
      : `Crossy: tu te fais écraser, tu perds ${wager} IC.`,
  });
});

app.post('/api/games/tower/play', authMiddleware, async (req, res) => {
  const context = await requireWager(req, res);
  if (!context) return;
  const { user, wager } = context;

  const success = Math.random() < 0.45;
  const height = success ? 1 + Math.floor(Math.random() * 5) : 0;
  let profit = 0;

  if (success) {
    profit = Math.round(wager * (0.7 + height * 0.4));
    applyWin(user, wager, profit, 'tower');
  } else {
    applyLoss(user, wager);
  }

  await db.write();

  res.json({
    game: 'tower',
    success,
    height,
    profit,
    balance: user.balance,
    stats: user.stats,
    summary: success
      ? `Tower: tu montes à l'étage ${height}, +${profit} IC.`
      : `Tower: tu tombes, tu perds ${wager} IC.`,
  });
});

app.post('/api/games/blackjack/play', authMiddleware, async (req, res) => {
  const context = await requireWager(req, res);
  if (!context) return;
  const { user, wager } = context;

  const outcomes = ['win', 'lose', 'push'];
  const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
  let profit = 0;

  if (outcome === 'win') {
    profit = Math.round(wager * 1.0);
    applyWin(user, wager, profit, 'blackjack');
  } else if (outcome === 'lose') {
    applyLoss(user, wager);
  } else {
    // push: on rend la mise
    user.stats.sessions += 1;
  }

  await db.write();

  res.json({
    game: 'blackjack',
    outcome,
    profit,
    balance: user.balance,
    stats: user.stats,
    summary:
      outcome === 'win'
        ? `Blackjack: tu gagnes +${profit} IC.`
        : outcome === 'lose'
        ? `Blackjack: tu perds ${wager} IC.`
        : `Blackjack: égalité, ta mise est rendue.`,
  });
});

app.post('/api/games/case-battle/play', authMiddleware, async (req, res) => {
  const context = await requireWager(req, res);
  if (!context) return;
  const { user, wager } = context;

  const roll = Math.random();
  let tier = 'low';
  let profit = 0;

  if (roll > 0.98) {
    tier = 'jackpot';
    profit = wager * 20;
    applyWin(user, wager, profit, 'case-battle');
  } else if (roll > 0.9) {
    tier = 'high';
    profit = wager * 5;
    applyWin(user, wager, profit, 'case-battle');
  } else if (roll > 0.6) {
    tier = 'mid';
    profit = Math.round(wager * 1.2);
    applyWin(user, wager, profit, 'case-battle');
  } else {
    applyLoss(user, wager);
  }

  await db.write();

  res.json({
    game: 'case-battle',
    tier,
    profit,
    balance: user.balance,
    stats: user.stats,
    summary:
      profit > 0
        ? `Case Battle: ${tier}, tu gagnes +${profit} IC.`
        : `Case Battle: rien de fou, tu perds ${wager} IC.`,
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

