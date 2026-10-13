
// Netlify Function : proxy sécurisé vers l'API gratuite Groq.
// La clé GROQ_API_KEY reste côté serveur (variable d'environnement Netlify, chiffrée au repos) :
// elle n'apparaît jamais dans le code du site ni dans le navigateur.
const J = (c, o) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
const SYSTEM = 'Tu es un tuteur de programmation et de cybersécurité sur la plateforme CodeLab. Réponds en français, brièvement, avec de petits exemples de code. En cybersécurité reste éducatif et défensif : refuse d aider à attaquer des systèmes non autorisés.';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return J(405, { error: 'POST uniquement' });
  const { GROQ_API_KEY, FIREBASE_API_KEY, GROQ_MODEL = 'llama-3.1-8b-instant' } = process.env;
  if (!GROQ_API_KEY || !FIREBASE_API_KEY) return J(500, { error: 'Variables GROQ_API_KEY / FIREBASE_API_KEY manquantes sur Netlify' });

  // 1) Seuls les utilisateurs connectés (Firebase, anonyme inclus) peuvent consommer le quota gratuit
  const tok = (event.headers.authorization || '').replace('Bearer ', '');
  if (!tok) return J(401, { error: 'Connexion requise' });
  const v = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: tok })
  });
  if (!v.ok) return J(401, { error: 'Session invalide, reconnectez-vous' });

  // 2) Nettoyage des entrées : rôles autorisés, longueur et nombre de messages limités
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return J(400, { error: 'JSON invalide' }); }
  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .slice(-10).map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!msgs.length) return J(400, { error: 'Aucun message' });

  // 3) Appel à Groq (format compatible OpenAI)
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ_API_KEY },
    body: JSON.stringify({ model: GROQ_MODEL, max_tokens: 500, temperature: 0.4, messages: [{ role: 'system', content: SYSTEM }, ...msgs] })
  });
  if (!r.ok) { console.error('Groq', r.status, await r.text()); return J(502, { error: r.status === 429 ? 'Quota gratuit atteint, réessayez dans une minute' : 'Erreur du service IA' }); }
  const d = await r.json();
  return J(200, { reply: d.choices?.[0]?.message?.content || '' });
};
