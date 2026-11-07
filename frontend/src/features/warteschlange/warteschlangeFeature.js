import { escapeHtml } from '../../shared/dom.js';

export function berechneWarteschlangeLast(lastMinuten, kapazitaetMinuten) {
  const last = Math.max(0, Number(lastMinuten) || 0);
  const kapazitaet = Math.max(0, Number(kapazitaetMinuten) || 0);
  const morgen = last > kapazitaet;
  const prozent = kapazitaet > 0
    ? Math.round((last / kapazitaet) * 100)
    : (last > 0 ? 100 : 0);

  return {
    prozent,
    balkenProzent: Math.min(prozent, 100),
    farbe: morgen ? '#c62828' : (prozent > 80 ? '#f57c00' : '#2e7d32'),
    morgen
  };
}

function formatMinuten(wert) {
  return `${Math.max(0, Number(wert) || 0)} min`;
}

export function installWarteschlangeFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    setWarteschlangeStatus(text, fehler = false) {
      const status = document.getElementById('warteschlangeStatus');
      if (!status) return;
      status.textContent = text;
      status.classList.toggle('error', fehler);
      status.setAttribute('role', fehler ? 'alert' : 'status');
    },

    setupWarteschlangeEvents() {
      const datum = document.getElementById('warteschlangeDatum');
      const aktualisieren = document.getElementById('warteschlangeAktualisieren');
      const board = document.getElementById('warteschlangeBoard');
      this.bindEventListenerOnce(datum, 'change', () => this.loadWarteschlange(), 'WarteschlangeDatum');
      this.bindEventListenerOnce(aktualisieren, 'click', () => this.loadWarteschlange(), 'WarteschlangeReload');
      this.bindEventListenerOnce(board, 'click', event => this.handleWarteschlangeClick(event), 'WarteschlangeClick');
      this.bindEventListenerOnce(board, 'dragstart', event => this.handleWarteschlangeDragStart(event), 'WarteschlangeDragStart');
      this.bindEventListenerOnce(board, 'dragover', event => this.handleWarteschlangeDragOver(event), 'WarteschlangeDragOver');
      this.bindEventListenerOnce(board, 'drop', event => this.handleWarteschlangeDrop(event), 'WarteschlangeDrop');
      this.bindEventListenerOnce(board, 'dragend', () => {
        this.warteschlangeDrag = null;
      }, 'WarteschlangeDragEnd');
    },

    async loadWarteschlange() {
      const datumInput = document.getElementById('warteschlangeDatum');
      const board = document.getElementById('warteschlangeBoard');
      if (!datumInput || !board) return;

      if (!datumInput.value) {
        datumInput.value = this.formatDateLocal(this.getToday());
      }
      const datum = datumInput.value;
      this.setupWarteschlangeEvents();
      this.setWarteschlangeStatus(`Zettel für ${datum} werden geladen …`);
      if (!this.warteschlangeData) {
        board.innerHTML = '<div class="loading">Zettel-Board wird geladen …</div>';
      }

      const requestId = (this.warteschlangeRequestId || 0) + 1;
      this.warteschlangeRequestId = requestId;
      try {
        const data = await WarteschlangeService.getByDatum(datum);
        if (requestId !== this.warteschlangeRequestId || datumInput.value !== datum) return;
        this.warteschlangeData = data;
        this.renderWarteschlange();
        this.setWarteschlangeStatus(`Stand: ${datum}`);
      } catch (error) {
        if (requestId !== this.warteschlangeRequestId) return;
        this.setWarteschlangeStatus(`Zettel-Board konnte nicht geladen werden: ${error.message}`, true);
        if (!this.warteschlangeData) {
          board.innerHTML = '<div class="error">Die Warteschlange ist derzeit nicht verfügbar.</div>';
        }
      }
    },

    renderWarteschlange() {
      const board = document.getElementById('warteschlangeBoard');
      const data = this.warteschlangeData;
      if (!board || !data) return;

      const neueTermine = data.neu?.termine || [];
      const importe = data.neu?.auftragsimporte || [];
      const neuInhalt = [
        ...neueTermine.map(termin => this.renderWarteschlangeTermin(termin)),
        ...importe.map(item => this.renderWarteschlangeImport(item))
      ].join('');

      const neuSpalte = `
        <section class="warteschlange-spalte warteschlange-neu" aria-labelledby="warteschlangeNeuTitel">
          <h3 id="warteschlangeNeuTitel">NEU</h3>
          <div class="warteschlange-zettel-liste">
            ${neuInhalt || '<p class="empty-state">Keine neuen Zettel</p>'}
          </div>
        </section>`;

      const mechaniker = (data.mitarbeiter || []).map(person => {
        const last = berechneWarteschlangeLast(person.last_minuten, person.kapazitaet_minuten);
        const zettel = (person.zettel || []).map(termin => (
          this.renderWarteschlangeTermin(termin, person.mitarbeiter_id)
        )).join('');
        return `
          <section class="warteschlange-spalte" aria-labelledby="warteschlangeMitarbeiter${person.mitarbeiter_id}">
            <h3 id="warteschlangeMitarbeiter${person.mitarbeiter_id}">${escapeHtml(person.mitarbeiter_name)}</h3>
            <div class="warteschlange-last-text">${formatMinuten(person.last_minuten)} / ${formatMinuten(person.kapazitaet_minuten)} · ${last.prozent} %</div>
            <div class="warteschlange-last-balken" role="progressbar" aria-label="Tageslast ${escapeHtml(person.mitarbeiter_name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${last.balkenProzent}">
              <div style="width:${last.balkenProzent}%;background:${last.farbe}"></div>
            </div>
            <div class="warteschlange-zettel-liste" data-mitarbeiter-id="${person.mitarbeiter_id}">
              ${zettel || '<p class="empty-state">Noch keine Zettel</p>'}
            </div>
          </section>`;
      }).join('');

      board.innerHTML = neuSpalte + (mechaniker || '<p class="empty-state">Keine aktiven Mechaniker vorhanden.</p>');
    },

    renderWarteschlangeTermin(termin, mitarbeiterId = null) {
      const terminId = Number(termin.id);
      const istMorgen = termin.morgen === true || termin.morgen === 1;
      const kollegen = istMorgen ? this.getWarteschlangeKollegen(termin, mitarbeiterId) : [];
      const optionen = kollegen.map(person => (
        `<option value="${person.mitarbeiter_id}">${escapeHtml(person.mitarbeiter_name)} (${formatMinuten(person.kapazitaet_minuten - person.last_minuten)} frei)</option>`
      )).join('');

      return `
        <article class="warteschlange-zettel${istMorgen ? ' warteschlange-zettel-morgen' : ''}" draggable="true" data-termin-id="${terminId}" data-mitarbeiter-id="${mitarbeiterId ?? ''}">
          <div class="warteschlange-zettel-kopf">
            <strong>${escapeHtml(termin.kunde_name || termin.termin_nr || 'Ohne Kundenname')}</strong>
            ${istMorgen ? '<span class="warteschlange-morgen">morgen</span>' : ''}
          </div>
          <div>${escapeHtml(termin.kennzeichen || 'Ohne Kennzeichen')}</div>
          <div>${escapeHtml(termin.arbeit || 'Keine Arbeit angegeben')}</div>
          <div class="warteschlange-zettel-meta">${formatMinuten(termin.geschaetzte_zeit)}</div>
          ${istMorgen ? `
            <button type="button" class="btn btn-sm btn-secondary" data-action="kollegen-oeffnen" aria-expanded="false" aria-controls="warteschlangeKollegen${terminId}">Zu Kollegen</button>
            <div id="warteschlangeKollegen${terminId}" class="warteschlange-kollegen" hidden>
              ${kollegen.length ? `
                <label for="warteschlangeKollegenSelect${terminId}">Mechaniker mit freier Kapazität</label>
                <select id="warteschlangeKollegenSelect${terminId}" data-kollegen-select>${optionen}</select>
                <button type="button" class="btn btn-sm btn-primary" data-action="kollegen-verschieben">Verschieben</button>` : '<p>Kein Kollege hat ausreichend freie Kapazität.</p>'}
            </div>` : ''}
        </article>`;
    },

    renderWarteschlangeImport(item) {
      const daten = item.erkannte_daten || {};
      return `
        <article class="warteschlange-zettel warteschlange-import" data-import-id="${Number(item.id)}">
          <div class="warteschlange-zettel-kopf"><strong>${escapeHtml(daten.kunde?.name || item.original_dateiname || 'PDF-Auftrag')}</strong><span>Auftragsimport</span></div>
          <div>${escapeHtml(daten.fahrzeug?.kennzeichen || 'Ohne Kennzeichen')}</div>
          <div>${escapeHtml(daten.arbeit?.summary || 'Auftrag aus PDF')}</div>
          <button type="button" class="btn btn-sm btn-primary" data-action="import-termin">Termin anlegen</button>
        </article>`;
    },

    getWarteschlangeKollegen(termin, aktuellerMitarbeiterId) {
      const benoetigt = Math.max(0, Number(termin.geschaetzte_zeit) || 0);
      return (this.warteschlangeData?.mitarbeiter || []).filter(person => (
        Number(person.mitarbeiter_id) !== Number(aktuellerMitarbeiterId)
        && Number(person.kapazitaet_minuten) - Number(person.last_minuten) >= benoetigt
      ));
    },

    async mutiereWarteschlange(mutation, erfolgsmeldung) {
      if (this.warteschlangeMutation) return;
      this.warteschlangeMutation = true;
      this.setWarteschlangeStatus('Änderung wird gespeichert …');
      try {
        await mutation();
        this.showToast(erfolgsmeldung, 'success');
        await this.loadWarteschlange();
      } catch (error) {
        this.setWarteschlangeStatus(`Änderung fehlgeschlagen: ${error.message}`, true);
        this.showToast('Die Warteschlange wurde nicht geändert.', 'error');
      } finally {
        this.warteschlangeMutation = false;
      }
    },

    async handleWarteschlangeClick(event) {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const karte = button.closest('.warteschlange-zettel');
      if (!karte) return;

      if (button.dataset.action === 'import-termin') {
        const importId = Number(karte.dataset.importId);
        await this.mutiereWarteschlange(
          () => AuftragsimportService.createSchnelltermin(importId, { ist_schwebend: 1 }),
          'Schwebender Termin wurde angelegt.'
        );
        return;
      }

      const terminId = Number(karte.dataset.terminId);
      if (button.dataset.action === 'kollegen-oeffnen') {
        const auswahl = karte.querySelector('.warteschlange-kollegen');
        if (!auswahl) return;
        auswahl.hidden = !auswahl.hidden;
        button.setAttribute('aria-expanded', String(!auswahl.hidden));
        if (!auswahl.hidden) auswahl.querySelector('select')?.focus();
        return;
      }

      if (button.dataset.action === 'kollegen-verschieben') {
        const mitarbeiterId = Number(karte.querySelector('[data-kollegen-select]')?.value);
        if (!mitarbeiterId) {
          this.setWarteschlangeStatus('Bitte einen Mechaniker mit freier Kapazität auswählen.', true);
          return;
        }
        await this.mutiereWarteschlange(
          () => WarteschlangeService.zuweisen(
            terminId,
            mitarbeiterId,
            null,
            document.getElementById('warteschlangeDatum')?.value
          ),
          'Zettel wurde an den Kollegen übergeben.'
        );
      }
    },

    handleWarteschlangeDragStart(event) {
      const karte = event.target.closest('.warteschlange-zettel[data-termin-id]');
      if (!karte) return;
      const terminId = Number(karte.dataset.terminId);
      const mitarbeiterId = Number(karte.dataset.mitarbeiterId) || null;
      this.warteschlangeDrag = { terminId, mitarbeiterId };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(terminId));
    },

    handleWarteschlangeDragOver(event) {
      if (!this.warteschlangeDrag || !event.target.closest('.warteschlange-zettel-liste[data-mitarbeiter-id]')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },

    async handleWarteschlangeDrop(event) {
      const liste = event.target.closest('.warteschlange-zettel-liste[data-mitarbeiter-id]');
      const drag = this.warteschlangeDrag;
      if (!liste || !drag) return;
      event.preventDefault();
      this.warteschlangeDrag = null;

      const zielMitarbeiterId = Number(liste.dataset.mitarbeiterId);
      const zielKarte = event.target.closest('.warteschlange-zettel[data-termin-id]');
      const zielTerminId = zielKarte ? Number(zielKarte.dataset.terminId) : null;
      const spalte = (this.warteschlangeData?.mitarbeiter || []).find(person => (
        Number(person.mitarbeiter_id) === zielMitarbeiterId
      ));
      if (!spalte) return;

      if (drag.mitarbeiterId === zielMitarbeiterId) {
        if (drag.terminId === zielTerminId) return;
        const ids = (spalte.zettel || []).map(termin => Number(termin.id));
        const neueIds = ids.filter(id => id !== drag.terminId);
        const zielIndex = zielTerminId ? neueIds.indexOf(zielTerminId) : neueIds.length;
        neueIds.splice(zielIndex < 0 ? neueIds.length : zielIndex, 0, drag.terminId);
        if (neueIds.every((id, index) => id === ids[index])) return;
        await this.mutiereWarteschlange(
          () => WarteschlangeService.reihenfolge(zielMitarbeiterId, neueIds),
          'Reihenfolge wurde gespeichert.'
        );
        return;
      }

      const position = zielTerminId
        ? (spalte.zettel || []).findIndex(termin => Number(termin.id) === zielTerminId) + 1
        : null;
      await this.mutiereWarteschlange(
        () => WarteschlangeService.zuweisen(
          drag.terminId,
          zielMitarbeiterId,
          position,
          document.getElementById('warteschlangeDatum')?.value
        ),
        'Zettel wurde zugewiesen.'
      );
    }
  });
}
