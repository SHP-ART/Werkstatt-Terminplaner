const WarteschlangeModel = require('../models/warteschlangeModel');
const AuftragsimportModel = require('../models/auftragsimportModel');
const AbwesenheitenModel = require('../models/abwesenheitenModel');
const TermineModel = require('../models/termineModel');
const EinstellungenModel = require('../models/einstellungenModel');
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

async function speichereReihenfolge(termine) {
  for (let index = 0; index < termine.length; index++) {
    await WarteschlangeModel.setPosition(termine[index].id, index + 1);
  }
}

function markiereUeberlauf(zettel, kapazitaet, nebenzeitProzent = 0) {
  let lastRoh = 0;
  let ueberlauf = false;
  const nebenzeitFaktor = 1 + (nebenzeitProzent / 100);

  const markierteZettel = zettel.map(termin => {
    const minuten = Number(termin.geschaetzte_zeit) || 0;
    const naechsteLast = Math.round((lastRoh + minuten) * nebenzeitFaktor);
    if (!ueberlauf && naechsteLast > kapazitaet) ueberlauf = true;
    lastRoh += minuten;
    return { ...termin, morgen: ueberlauf };
  });

  return { zettel: markierteZettel, last_minuten: Math.round(lastRoh * nebenzeitFaktor) };
}

function toPublicImport({ text_extract, dateipfad, ...item }) {
  return item;
}

class WarteschlangeController {
  static async get(req, res) {
    const datum = req.query.datum;
    if (!datum) throw new ValidationError('Datum ist erforderlich');
    pruefeKalenderdatum(datum);

    const [mitarbeiter, zettel, neueTermine, offeneImporte, abwesenheiten, einstellungen] = await Promise.all([
      WarteschlangeModel.getAktiveMitarbeiter(),
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

    res.json({
      datum,
      mitarbeiter: spalten,
      neu: {
        termine: neueTermine,
        auftragsimporte: offeneImporte.map(toPublicImport)
      }
    });
  }

  static async getNaechster(req, res) {
    const mitarbeiterId = parseId(req.params.id, 'mitarbeiter_id');
    await getMitarbeiterOder404(mitarbeiterId);

    const jetzt = new Date();
    const datum = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`;
    const zettel = await WarteschlangeModel.getNaechster(datum, mitarbeiterId);
    res.json({ datum, zettel: zettel || null });
  }

  static async zuweisen(req, res) {
    const terminId = parseId(req.body?.termin_id, 'termin_id');
    const mitarbeiterId = parseId(req.body?.mitarbeiter_id, 'mitarbeiter_id');
    const gewaehltesDatum = req.body?.datum;
    if (gewaehltesDatum !== undefined) pruefeKalenderdatum(gewaehltesDatum);

    const termin = await withQueueTransaction(async () => {
      const aktuellerTermin = await getTerminOder404(terminId);
      await getMitarbeiterOder404(mitarbeiterId);
      const zielDatum = gewaehltesDatum ?? aktuellerTermin.datum;

      if (!zielDatum) {
        throw new ValidationError('Termin hat kein Datum');
      }

      const zielListe = await WarteschlangeModel.getWarteschlange(
        zielDatum,
        mitarbeiterId,
        terminId
      );
      const hatPosition = req.body?.position !== undefined && req.body?.position !== null;
      const position = hatPosition
        ? parseId(req.body.position, 'position')
        : await WarteschlangeModel.getNaechstePosition(
          zielDatum,
          mitarbeiterId,
          terminId
        );

      if (hatPosition && position > zielListe.length + 1) {
        throw new ValidationError('position liegt ausserhalb der Warteschlange');
      }

      const alteListeGeaendert = aktuellerTermin.warteschlange_pos !== null
        && (aktuellerTermin.mitarbeiter_id !== mitarbeiterId || aktuellerTermin.datum !== zielDatum);
      if (alteListeGeaendert) {
        const alteListe = await WarteschlangeModel.getWarteschlange(
          aktuellerTermin.datum,
          aktuellerTermin.mitarbeiter_id,
          terminId
        );
        await speichereReihenfolge(alteListe);
      }

      if (hatPosition) {
        zielListe.splice(position - 1, 0, { id: terminId });
        await speichereReihenfolge(zielListe);
      }
      return await WarteschlangeModel.zuweisen(terminId, mitarbeiterId, position, zielDatum);
    });

    broadcastEvent('termin.queue_updated', { mitarbeiter_id: mitarbeiterId });
    res.json(termin);
  }

  static async reihenfolge(req, res) {
    const mitarbeiterId = parseId(req.body?.mitarbeiter_id, 'mitarbeiter_id');
    const terminIds = req.body?.termin_ids;

    if (!Array.isArray(terminIds) || terminIds.length === 0) {
      throw new ValidationError('termin_ids muss eine nicht leere Liste sein');
    }
    const ids = terminIds.map(id => parseId(id, 'termin_id'));
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('termin_ids darf keine Duplikate enthalten');
    }

    await withQueueTransaction(async () => {
      await getMitarbeiterOder404(mitarbeiterId);
      let datum;
      for (const id of ids) {
        const termin = await getTerminOder404(id);
        if (termin.mitarbeiter_id !== mitarbeiterId) {
          throw new NotFoundError('Termin in der Warteschlange des Mitarbeiters');
        }
        if (datum === undefined) datum = termin.datum;
      }

      const aktiveSchlange = await WarteschlangeModel.getWarteschlange(datum, mitarbeiterId);
      const aktiveIds = new Set(aktiveSchlange.map(termin => termin.id));
      if (aktiveIds.size !== ids.length || ids.some(id => !aktiveIds.has(id))) {
        throw new ValidationError('termin_ids muss die vollständige aktive Warteschlange enthalten');
      }

      for (let index = 0; index < ids.length; index++) {
        await WarteschlangeModel.setPositionFuerMitarbeiter(ids[index], mitarbeiterId, index + 1);
      }
    });

    broadcastEvent('termin.queue_updated', { mitarbeiter_id: mitarbeiterId });
    res.json({ mitarbeiter_id: mitarbeiterId, termin_ids: ids });
  }

  static async naechsterTag(req, res) {
    const terminId = parseId(req.params.terminId, 'terminId');

    const termin = await withQueueTransaction(async () => {
      const aktuellerTermin = await getTerminOder404(terminId);
      if (!aktuellerTermin.datum) throw new ValidationError('Termin hat kein Datum');
      if (!aktuellerTermin.mitarbeiter_id) {
        throw new ValidationError('Termin ist keinem Mitarbeiter zugewiesen');
      }

      const zielDatum = TermineModel.naechsterArbeitstag(aktuellerTermin.datum);
      const [alteListe, naechstePosition] = await Promise.all([
        WarteschlangeModel.getWarteschlange(
          aktuellerTermin.datum,
          aktuellerTermin.mitarbeiter_id,
          terminId
        ),
        WarteschlangeModel.getNaechstePosition(
          zielDatum,
          aktuellerTermin.mitarbeiter_id,
          terminId
        )
      ]);

      await speichereReihenfolge(alteListe);
      return await WarteschlangeModel.aufNaechstenTagVerschieben(
        terminId,
        zielDatum,
        naechstePosition
      );
    });

    broadcastEvent('termin.queue_updated', { mitarbeiter_id: termin.mitarbeiter_id });
    res.json(termin);
  }
}

module.exports = WarteschlangeController;
