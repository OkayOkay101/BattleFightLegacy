function safeParticipant(person) {
  return {
    id: String(person.id),
    name: typeof person.name === 'string' && person.name.trim() ? person.name : null,
    teamId: person.teamId === 'blue' || person.teamId === 'red' ? person.teamId : null,
    characterId: typeof person.characterId === 'string' ? person.characterId : null
  };
}

function copyEvent(event) {
  return {
    eventId: event.eventId,
    killer: event.killer && { ...event.killer },
    victim: { ...event.victim },
    at: event.at
  };
}

class KillFeed {
  constructor(limit = 12) {
    this.limit = Number.isInteger(limit) && limit > 0 ? limit : 12;
    this.seenLifeIds = new Set();
    this.events = [];
  }

  recordDeath({ lifeId, victim, attacker, hostile, at } = {}) {
    if (lifeId == null || String(lifeId).trim() === '' || !victim || victim.id == null || String(victim.id).trim() === '') {
      return null;
    }
    const id = String(lifeId);
    if (this.seenLifeIds.has(id)) return null;

    const safeVictim = safeParticipant(victim);
    const attackerTeam = attacker && (attacker.teamId === 'blue' || attacker.teamId === 'red') ? attacker.teamId : null;
    const isOpposingEnemy = attacker && attacker.id != null && String(attacker.id) !== safeVictim.id &&
      hostile === true && attackerTeam && safeVictim.teamId && attackerTeam !== safeVictim.teamId;
    const event = {
      eventId: id,
      killer: isOpposingEnemy ? safeParticipant(attacker) : null,
      victim: safeVictim,
      at: Number.isFinite(at) ? at : Date.now()
    };

    this.seenLifeIds.add(id);
    this.events.unshift(event);
    if (this.events.length > this.limit) this.events.length = this.limit;
    return copyEvent(event);
  }

  recent() {
    return this.events.map(copyEvent);
  }
}

module.exports = { KillFeed };
