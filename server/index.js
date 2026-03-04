const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { nanoid } = require('nanoid');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || 'REMPLACE_AVEC_TON_CLIENT_ID';

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
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

async function findUserByGoogleId(googleId) {
  await db.read();
  return db.data.users.find((u) => u.googleId === googleId);
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

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

app.post('/api/auth/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ message: 'Jeton Google manquant.' });
  }
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'REMPLACE_AVEC_TON_CLIENT_ID') {
    return res
      .status(500)
      .json({ message: 'Google OAuth non configuré sur le serveur.' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;

    await db.read();
    let user = await findUserByGoogleId(googleId);
    if (!user) {
      user =
        (await findUserByEmail(email)) ||
        {
          id: nanoid(),
          email,
          username: name || email.split('@')[0],
          googleId,
          passwordHash: null,
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

      const existingIndex = db.data.users.findIndex((u) => u.id === user.id);
      if (existingIndex === -1) {
        db.data.users.push(user);
      } else {
        db.data.users[existingIndex] = user;
      }
      await db.write();
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
  } catch (err) {
    console.error('Erreur Google OAuth', err);
    res.status(401).json({ message: 'Authentification Google invalide.' });
  }
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
  await db.read();
  const user = db.data.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });

  user.settings = { ...user.settings, ...settings };
  await db.write();
  res.json({ settings: user.settings });
});

app.post('/api/games/crash/play', authMiddleware, async (req, res) => {
  const { wager } = req.body;
  if (typeof wager !== 'number' || wager <= 0) {
    return res.status(400).json({ message: 'Mise invalide.' });
  }

  await db.read();
  const user = db.data.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });
  if (user.balance < wager) {
    return res.status(400).json({ message: 'Solde insuffisant.' });
  }

  const crashed = Math.random() < 0.5;
  let winAmount = 0;

  user.stats.sessions += 1;
  user.stats.totalWagered += wager;

  if (crashed) {
    user.balance -= wager;
    user.stats.losses += 1;
    user.stats.netProfit -= wager;
  } else {
    const multiplier = 1 + Math.random() * 3;
    winAmount = Math.round(wager * multiplier);
    user.balance += winAmount;
    user.stats.wins += 1;
    user.stats.netProfit += winAmount - wager;
    if (winAmount > user.stats.biggestWin) {
      user.stats.biggestWin = winAmount;
    }
  }

  await db.write();

  res.json({
    crashed,
    winAmount,
    balance: user.balance,
    stats: user.stats,
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

