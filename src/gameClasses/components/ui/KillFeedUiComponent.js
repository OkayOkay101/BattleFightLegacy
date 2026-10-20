var KillFeedUiComponent = IgeEntity.extend({
  classId: 'KillFeedUiComponent',
  componentId: 'killFeed',

  init: function () {
    this.container = typeof document !== 'undefined' ? document.getElementById('kill-feed-entries') : null;
    this.events = [];
    this.seenEventIds = new Set();
    var i18n = ige.client && ige.client.i18n;
    this._unsubscribeI18n = i18n && i18n.subscribe(this.render.bind(this));
    this.render();
  },

  add: function (event) {
    if (!event || !event.eventId || !event.victim || !event.victim.id) return false;
    var eventId = String(event.eventId);
    if (this.seenEventIds.has(eventId)) return false;
    this.seenEventIds.add(eventId);
    this.events.unshift({
      eventId: eventId,
      killer: event.killer ? { ...event.killer } : null,
      victim: { ...event.victim },
      at: event.at
    });
    if (this.events.length > 12) this.events.length = 12;
    this.render();
    return true;
  },

  _participantLabel: function (participant) {
    var i18n = ige.client && ige.client.i18n;
    var translate = i18n ? i18n.t.bind(i18n) : function (key) { return key; };
    var name = participant.name || translate('feed.unknownPlayer');
    var context = [];
    if (participant.teamId === 'blue' || participant.teamId === 'red') {
      context.push(translate('feed.team.' + participant.teamId));
    }
    if (participant.characterId && ige.game && ige.game.getAsset) {
      var character = ige.game.getAsset('unitTypes', participant.characterId);
      if (character && typeof character.name === 'string' && character.name) context.push(character.name);
    }
    return context.length ? name + ' (' + context.join(' · ') + ')' : name;
  },

  render: function () {
    if (!this.container || typeof document === 'undefined') return;
    var i18n = ige.client && ige.client.i18n;
    var translate = i18n ? i18n.t.bind(i18n) : function (key, values) {
      return String(key).replace(/\{(\w+)\}/g, function (_, name) { return values[name] || ''; });
    };
    this.container.textContent = '';
    this.events.forEach(function (event) {
      var killer = event.killer && this._participantLabel(event.killer);
      var victim = this._participantLabel(event.victim);
      var row = document.createElement('div');
      row.className = 'kill-feed-entry';
      row.setAttribute('role', 'status');
      row.textContent = killer
        ? translate('feed.kill', { killer: killer, victim: victim })
        : translate('feed.elimination', { victim: victim });
      this.container.appendChild(row);
    }, this);
  }
});

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') module.exports = KillFeedUiComponent;
