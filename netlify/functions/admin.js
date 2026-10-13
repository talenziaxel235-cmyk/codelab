// Fonction admin CodeLab. Variables Netlify requises :
//  FIREBASE_SERVICE_ACCOUNT : contenu JSON de la clé de compte de service (ou son équivalent base64)
//  ADMIN_UIDS               : UID des admins, séparés par des virgules
//  FIREBASE_API_KEY         : le apiKey web Firebase (déjà utilisé par chat.js)
const admin = require('firebase-admin');

function init() {
  if (admin.apps.length) return;
  let raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

const admins = () => (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
const json = (code, body) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

// Nom du champ de points dans users/{uid} : adapte cette liste si besoin
const POINT_KEYS = ['points', 'score', 'pts', 'xp'];
const readPoints = d => {
  for (const k of POINT_KEYS) if (typeof d[k] === 'number') return [k, d[k]];
  return [POINT_KEYS[0], 0];
};

async function login({ email, password }) {
  const r = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + process.env.FIREBASE_API_KEY,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const d = await r.json();
  if (!r.ok) return json(401, { error: 'E-mail ou mot de passe incorrect' });
  if (!admins().includes(d.localId)) return json(403, { error: "Ce compte n'est pas administrateur" });
  return json(200, { token: d.idToken, email: d.email, uid: d.localId });
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST uniquement' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON invalide' }); }

  try {
    init();
    if (b.action === 'login') return await login(b);

    const auth = admin.auth();
    const db = admin.firestore();
    const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer /, '');
    let me;
    try { me = await auth.verifyIdToken(token); }
    catch { return json(401, { error: 'Session expirée, reconnecte-toi' }); }
    if (!admins().includes(me.uid)) return json(403, { error: 'Accès réservé aux administrateurs' });

    if (b.action === 'list') {
      const docs = (await db.collection('users').limit(1000).get()).docs;
      const users = [];
      for (let i = 0; i < docs.length; i += 100) {
        const chunk = docs.slice(i, i + 100);
        const res = await auth.getUsers(chunk.map(d => ({ uid: d.id })));
        const byUid = new Map(res.users.map(u => [u.uid, u]));
        for (const d of chunk) {
          const u = byUid.get(d.id);
          users.push({
            uid: d.id,
            email: u ? u.email || null : null,
            anonymous: u ? !u.providerData.length : null,
            disabled: !!(u && u.disabled),
            orphan: !u,
            isAdmin: admins().includes(d.id),
            created: u ? u.metadata.creationTime : null,
            lastSignIn: u ? u.metadata.lastSignInTime : null,
            points: readPoints(d.data())[1],
          });
        }
      }
      return json(200, { users });
    }

    if (b.action === 'logs') {
      const s = await db.collection('adminLogs').orderBy('at', 'desc').limit(50).get();
      return json(200, {
        logs: s.docs.map(d => {
          const x = d.data();
          return { by: x.byEmail || x.by, action: x.action, target: x.target, at: x.at ? x.at.toDate().toISOString() : null };
        }),
      });
    }

    // Actions sur un compte : uniquement ceux qui ont un document users/{uid} dans CodeLab
    const ACTIONS = ['setPoints', 'resetProgress', 'disable', 'enable', 'revoke', 'resetLink', 'delete'];
    if (!ACTIONS.includes(b.action)) return json(400, { error: 'Action inconnue' });
    const uid = String(b.uid || '');
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!uid || !snap.exists) return json(404, { error: 'Compte introuvable dans CodeLab' });
    const risky = ['delete', 'disable', 'resetProgress'].includes(b.action);
    if (risky && admins().includes(uid)) return json(403, { error: 'Impossible sur un compte administrateur' });

    let result = {};
    switch (b.action) {
      case 'setPoints': {
        const v = Math.round(Number(b.value));
        if (!Number.isFinite(v) || v < 0 || v > 1000000) return json(400, { error: 'Valeur invalide (0 à 1 000 000)' });
        await ref.set({ [readPoints(snap.data())[0]]: v }, { merge: true });
        break;
      }
      case 'resetProgress': await ref.delete(); break;
      case 'disable': await auth.updateUser(uid, { disabled: true }); await auth.revokeRefreshTokens(uid); break;
      case 'enable': await auth.updateUser(uid, { disabled: false }); break;
      case 'revoke': await auth.revokeRefreshTokens(uid); break;
      case 'resetLink': {
        const u = await auth.getUser(uid);
        if (!u.email) return json(400, { error: 'Compte anonyme : pas de mot de passe' });
        result = { link: await auth.generatePasswordResetLink(u.email) };
        break;
      }
      case 'delete':
        try { await auth.deleteUser(uid); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }
        await ref.delete();
        break;
    }

    await db.collection('adminLogs').add({
      by: me.uid, byEmail: me.email || null, action: b.action, target: uid,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return json(200, { ok: true, ...result });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Erreur serveur : ' + (e.message || 'inconnue') });
  }
};
