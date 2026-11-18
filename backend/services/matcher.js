// Simple keyword-overlap match scorer (0-100), like Ambo's match %
function score(jobText, userSkills, role) {
  const text = (jobText || '').toLowerCase();
  const skills = (userSkills || []).map(s => s.toLowerCase());
  if (!skills.length) return 50;
  let hits = 0;
  for (const s of skills) if (text.includes(s)) hits++;
  let base = Math.round((hits / skills.length) * 100);
  // role bonus
  if (role && text.includes(role.toLowerCase().split(' ')[0])) base = Math.min(100, base + 5);
  // clamp to bands Ambo uses
  if (base >= 85) return 85;
  if (base >= 75) return 79;
  return 72;
}
module.exports = { score };
