const WarteschlangeModel = require('../models/warteschlangeModel');
const AuftragsimportModel = require('../models/auftragsimportModel');
const AbwesenheitenModel = require('../models/abwesenheitenModel');
const TermineModel = require('../models/termineModel');
const TermineController = require('./termineController');
const { berechneZeitenFuerPerson } = require('../services/zeitplanungService');
const EinstellungenModel = require('../models/einstellungenModel');
const LehrlingeModel = require('../models/lehrlingeModel');
const { withTransaction: withDatabaseTransaction } = require('../utils/transaction');
const { berechneKapazitaet } = require('../utils/auslastung');
const { broadcastEvent } = require('../utils/websocket');
const { NotFoundError, ValidationError } = require('../utils/errors');

let queueMutationTail = Promise.resolve();

function withQueueTransaction(callback) {
  const run = () => withDatabaseTransaction(callback);
  const result = queueMutationTail.then(run, run);
  queueMutationTail = result.catch(() => {});
  return result;
}

function parseId(value, field) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`${field} muss eine positive ganze Zahl sein`);
  }
  return id;
}

function pruefeKalenderdatum(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError('datum muss im Format YYYY-MM-DD angegeben werden');
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ValidationError('datum muss ein gültiges Datum im Format YYYY-MM-DD sein');
  }
}

function loeseRessource(body) {
  if (body.person_typ !== undefined || body.person_id !== undefined) {
    if (!['mitarbeiter', 'lehrling'].includes(body.person_typ)) {
      throw new ValidationError('person_typ muss mitarbeiter oder lehrling sein');
    }
    return { typ: body.person_typ, id: parseId(body.person_id, 'person_id') };
  }
  if (body.lehrling_id !== undefined) {
    return { typ: 'lehrling', id: parseId(body.lehrling_id, 'lehrling_id') };
  }
  return { typ: 'mitarbeiter', id: parseId(body.mitarbeiter_id, 'mitarbeiter_id') };
}

function ressourceAusTermin(termin) {
  if (termin.lehrling_id) return { typ: 'lehrling', id: termin.lehrling_id };
  if (termin.mitarbeiter_id) return { typ: 'mitarbeiter', id: termin.mitarbeiter_id };
  return null;
}

function queueEventPayload(ressource) {
  return ressource.typ === 'lehrling'
    ? { lehrling_id: ressource.id }
    : { mitarbeiter_id: ressource.id };
}

async function berechneQueueZeiten(ressource, datum, startTerminId = null) {
  const ergebnis = await berechneZeitenFuerPerson({
    personId: ressource.id,
    personTyp: ressource.typ,
    datum,
    startTerminId
  });
  TermineController.invalidateTermineCache();
  TermineController.invalidateAuslastungCache(datum);
  ergebnis.verschobeneTermine.forEach(termin => {
    TermineController.invalidateAuslastungCache(termin.neuesDatum);
  });
  return ergebnis;
}

async function getTerminOder404(id) {
  const termin = await WarteschlangeModel.getTermin(id);
  if (!termin) throw new NotFoundError('Termin');
  return termin;
}

async function getMitarbeiterOder404(id) {
  const mitarbeiter = await WarteschlangeModel.getMitarbeiter(id);
  if (!mitarbeiter) throw new NotFoundError('Mitarbeiter');
  return mitarbeiter;
}

async function getRessourceOder404(ressource) {
  if (ressource.typ === 'lehrling') {
    const lehrling = await LehrlingeModel.getById(ressource.id);
    if (!lehrling) throw new NotFoundError('Lehrling');
    return lehrling;
  }
  return await getMitarbeiterOder404(ressource.id);
}

async function speichereReihenfolge(termine) {
  for (let index = 0; index < termine.length; index++) {
    await WarteschlangeModel.setPosition(termine[index].id, index + 1);
  }
}

function markiereUeberlauf(zettel, kapazitaet, nebenzeitProzent = 0, aufgabenbewaeltigungProzent = 100) {
  let lastRoh = 0;
  let ueberlauf = false;
  const nebenzeitFaktor = 1 + (nebenzeitProzent / 100);
  const aufgabenFaktor = aufgabenbewaeltigungProzent / 100;

  const markierteZettel = zettel.map(termin => {
    const minuten = Number(termin.geschaetzte_zeit) || 0;
    const naechsteLast = Math.round((lastRoh + minuten) * nebenzeitFaktor * aufgabenFaktor);
    if (!ueberlauf && naechsteLast > kapazitaet) ueberlauf = true;
    lastRoh += minuten;
    return {
      ...termin,
      effektive_zeit_minuten: Math.round(minuten * nebenzeitFaktor * aufgabenFaktor),
      morgen: ueberlauf
    };
  });

  return {
    zettel: markierteZettel,
    last_minuten: Math.round(lastRoh * nebenzeitFaktor * aufgabenFaktor)
  };
}

function toPublicImport({ text_extract, dateipfad, ...item }) {
  return item;
}

class WarteschlangeController {
  static async get(req, res) {
    const datum = req.query.datum;
    if (!datum) throw new ValidationError('Datum ist erforderlich');
    pruefeKalenderdatum(datum);

    const [mitarbeiter, lehrlinge, zettel, neueTermine, offeneImporte, abwesenheiten, einstellungen] = await Promise.all([
      WarteschlangeModel.getAktiveMitarbeiter(),
      LehrlingeModel.getAktive(),
      WarteschlangeModel.getWarteschlange(datum),
      WarteschlangeModel.getNeueTermine(),
      AuftragsimportModel.getAll({ offen: true }),
      AbwesenheitenModel.getForDate(datum),
      EinstellungenModel.getWerkstatt()
    ]);
    const nebenzeitProzent = einstellungen?.nebenzeit_prozent || 0;

    const abwesendeMitarbeiter = new Set(
      abwesenheiten
        .filter(item => item.mitarbeiter_id !== null && item.mitarbeiter_id !== undefined)
        .map(item => Number(item.mitarbeiter_id))
    );
    const abwesendeLehrlinge = new Set(
      abwesenheiten
        .filter(item => item.lehrling_id !== null && item.lehrling_id !== undefined)
        .map(item => Number(item.lehrling_id))
    );

    const spalten = mitarbeiter.map(person => {
      const kapazitaet = berechneKapazitaet({
        mitarbeiter: [person],
        lehrlinge: [],
        abwesendeMitarbeiter,
        abwesendeLehrlinge: new Set()
      });
      const eigeneZettel = zettel.filter(termin => termin.mitarbeiter_id === person.id);
      const last = markiereUeberlauf(eigeneZettel, kapazitaet, nebenzeitProzent);

      return {
        mitarbeiter_id: person.id,
        mitarbeiter_name: person.name,
        kapazitaet_minuten: kapazitaet,
        last_minuten: last.last_minuten,
        zettel: last.zettel
      };
    });

    const lehrlingsSpalten = lehrlinge.map(person => {
      const kapazitaet = berechneKapazitaet({
        mitarbeiter: [],
        lehrlinge: [person],
        abwesendeMitarbeiter: new Set(),
        abwesendeLehrlinge
      });
      const eigeneZettel = zettel.filter(termin => termin.lehrling_id === person.id);
      const last = markiereUeberlauf(
        eigeneZettel,
        kapazitaet,
        nebenzeitProzent,
        person.aufgabenbewaeltigung_prozent || 100
      );
      return {
        lehrling_id: person.id,
        lehrling_name: person.name,
        kapazitaet_minuten: kapazitaet,
        last_minuten: last.last_minuten,
        zettel: last.zettel
      };
    });

    res.json({
      datum,
      mitarbeiter: spalten,
      lehrlinge: lehrlingsSpalten,
      neu: {
        termine: neueTermine,
        auftragsimporte: offeneImporte.map(toPublicImport)
      }
    });
  }

  static async getNaechster(req, res) {
    const mitarbeiterId = parseId(req.params.id, 'mitarbeiter_id');
    const ressource = { typ: 'mitarbeiter', id: mitarbeiterId };
    await getRessourceOder404(ressource);

    const jetzt = new Date();
    const datum = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`;
    const zettel = await WarteschlangeModel.getNaechster(datum, ressource);
    if (zettel) zettel.arbeiten = await WarteschlangeModel.getArbeiten(zettel.id);
    res.json({ datum, zettel: zettel || null });
  }

  static async zuweisen(req, res) {
    const terminId = parseId(req.body?.termin_id, 'termin_id');
    const ressource = loeseRessource(req.body || {});
    const gewaehltesDatum = req.body?.datum;
    if (gewaehltesDatum !== undefined) pruefeKalenderdatum(gewaehltesDatum);

    const termin = await withQueueTransaction(async () => {
      const aktuellerTermin = await getTerminOder404(terminId);
      await getRessourceOder404(ressource);
      const zielDatum = gewaehltesDatum ?? aktuellerTermin.datum;

      if (!zielDatum) {
        throw new ValidationError('Termin hat kein Datum');
      }

      const zielListe = await WarteschlangeModel.getWarteschlange(
        zielDatum,
        ressource,
        terminId
      );
      const hatPosition = req.body?.position !== undefined && req.body?.position !== null;
      const position = hatPosition
        ? parseId(req.body.position, 'position')
        : await WarteschlangeModel.getNaechstePosition(
          zielDatum,
          ressource,
          terminId
        );

      if (hatPosition && position > zielListe.length + 1) {
        throw new ValidationError('position liegt ausserhalb der Warteschlange');
      }

      const aktuelleRessource = ressourceAusTermin(aktuellerTermin);
      const alteListeGeaendert = aktuellerTermin.warteschlange_pos !== null
        && aktuelleRessource
        && (aktuelleRessource.typ !== ressource.typ
          || aktuelleRessource.id !== ressource.id
          || aktuellerTermin.datum !== zielDatum);
      if (alteListeGeaendert) {
        const alteListe = await WarteschlangeModel.getWarteschlange(
          aktuellerTermin.datum,
          aktuelleRessource,
          terminId
        );
        await speichereReihenfolge(alteListe);
        await berechneQueueZeiten(aktuelleRessource, aktuellerTermin.datum, terminId);
      }

      if (hatPosition) {
        zielListe.splice(position - 1, 0, { id: terminId });
        await speichereReihenfolge(zielListe);
      }
      let details = {};
      if (aktuellerTermin.arbeitszeiten_details) {
        try {
          details = JSON.parse(aktuellerTermin.arbeitszeiten_details);
        } catch (error) {
          details = {};
        }
      }
      details._gesamt_mitarbeiter_id = { type: ressource.typ, id: ressource.id };
      const zugewiesenerTermin = await WarteschlangeModel.zuweisen(
        terminId,
        ressource,
        position,
        zielDatum,
        JSON.stringify(details)
      );
      await berechneQueueZeiten(ressource, zielDatum, terminId);
      return zugewiesenerTermin;
    });

    broadcastEvent('termin.updated', { datum: termin.datum });
    broadcastEvent('termin.queue_updated', queueEventPayload(ressource));
    res.json(termin);
  }

  static async reihenfolge(req, res) {
    const ressource = loeseRessource(req.body || {});
    const terminIds = req.body?.termin_ids;

    if (!Array.isArray(terminIds) || terminIds.length === 0) {
      throw new ValidationError('termin_ids muss eine nicht leere Liste sein');
    }
    const ids = terminIds.map(id => parseId(id, 'termin_id'));
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('termin_ids darf keine Duplikate enthalten');
    }

    let datum;
    await withQueueTransaction(async () => {
      await getRessourceOder404(ressource);
      for (const id of ids) {
        const termin = await getTerminOder404(id);
        const terminRessource = ressourceAusTermin(termin);
        if (!terminRessource
          || terminRessource.typ !== ressource.typ
          || terminRessource.id !== ressource.id) {
          throw new NotFoundError('Termin in der Warteschlange der Person');
        }
        if (datum === undefined) datum = termin.datum;
      }

      const aktiveSchlange = await WarteschlangeModel.getWarteschlange(datum, ressource);
      const aktiveIds = new Set(aktiveSchlange.map(termin => termin.id));
      if (aktiveIds.size !== ids.length || ids.some(id => !aktiveIds.has(id))) {
        throw new ValidationError('termin_ids muss die vollständige aktive Warteschlange enthalten');
      }

      for (let index = 0; index < ids.length; index++) {
        await WarteschlangeModel.setPositionFuerRessource(ids[index], ressource, index + 1);
      }
      await berechneQueueZeiten(ressource, datum);
    });

    broadcastEvent('termin.updated', { datum });
    broadcastEvent('termin.queue_updated', queueEventPayload(ressource));
    res.json({
      person_typ: ressource.typ,
      person_id: ressource.id,
      mitarbeiter_id: ressource.typ === 'mitarbeiter' ? ressource.id : null,
      lehrling_id: ressource.typ === 'lehrling' ? ressource.id : null,
      termin_ids: ids
    });
  }

  static async naechsterTag(req, res) {
    const terminId = parseId(req.params.terminId, 'terminId');

    const termin = await withQueueTransaction(async () => {
      const aktuellerTermin = await getTerminOder404(terminId);
      if (!aktuellerTermin.datum) throw new ValidationError('Termin hat kein Datum');
      const ressource = ressourceAusTermin(aktuellerTermin);
      if (!ressource) {
        throw new ValidationError('Termin ist keiner Person zugewiesen');
      }

      const zielDatum = TermineModel.naechsterArbeitstag(aktuellerTermin.datum);
      const [alteListe, naechstePosition] = await Promise.all([
        WarteschlangeModel.getWarteschlange(
          aktuellerTermin.datum,
          ressource,
          terminId
        ),
        WarteschlangeModel.getNaechstePosition(
          zielDatum,
          ressource,
          terminId
        )
      ]);

      await speichereReihenfolge(alteListe);
      await berechneQueueZeiten(ressource, aktuellerTermin.datum, terminId);
      const verschobenerTermin = await WarteschlangeModel.aufNaechstenTagVerschieben(
        terminId,
        zielDatum,
        naechstePosition
      );
      await berechneQueueZeiten(ressource, zielDatum, terminId);
      return verschobenerTermin;
    });

    broadcastEvent('termin.updated', { datum: termin.datum });
    broadcastEvent('termin.queue_updated', queueEventPayload(ressourceAusTermin(termin)));
    res.json(termin);
  }
}

module.exports = WarteschlangeController;
