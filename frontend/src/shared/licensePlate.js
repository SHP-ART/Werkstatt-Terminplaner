export function normalizeKennzeichen(kz) {
  return (kz || '').toUpperCase().replace(/[\s\-]/g, '');
}

export function parseKennzeichen(kz) {
  if (!kz) return { bezirk: '', buchstaben: '', nummer: '' };

  const original = (kz || '').toUpperCase().trim();

  const mitTrennzeichen = original.match(/^([A-ZÄÖÜ]{1,3})[\s\-]+([A-ZÄÖÜ]{1,2})[\s\-]*(\d+[A-Z]?)$/);
  if (mitTrennzeichen) {
    return {
      bezirk: mitTrennzeichen[1],
      buchstaben: mitTrennzeichen[2],
      nummer: mitTrennzeichen[3]
    };
  }

  const einTrennzeichen = original.match(/^([A-ZÄÖÜ]{1,3})[\s\-]+([A-ZÄÖÜ]{1,2})(\d+[A-Z]?)$/);
  if (einTrennzeichen) {
    return {
      bezirk: einTrennzeichen[1],
      buchstaben: einTrennzeichen[2],
      nummer: einTrennzeichen[3]
    };
  }

  const normalized = normalizeKennzeichen(original);

  for (let bezirkLen = 1; bezirkLen <= 3; bezirkLen++) {
    const potBezirk = normalized.substring(0, bezirkLen);
    const rest = normalized.substring(bezirkLen);
    const buchstabenMatch = rest.match(/^([A-ZÄÖÜ]{1,2})(\d+[A-Z]?)$/);
    if (buchstabenMatch && /^[A-ZÄÖÜ]+$/.test(potBezirk)) {
      return {
        bezirk: potBezirk,
        buchstaben: buchstabenMatch[1],
        nummer: buchstabenMatch[2]
      };
    }
  }

  const bezirkMatch = normalized.match(/^([A-ZÄÖÜ]{1,3})/);
  const bezirk = bezirkMatch ? bezirkMatch[1] : '';
  const rest = normalized.substring(bezirk.length);
  const buchstabenMatch = rest.match(/^([A-ZÄÖÜ]{1,2})/);
  const buchstaben = buchstabenMatch ? buchstabenMatch[1] : '';
  const nummer = rest.substring(buchstaben.length);

  return { bezirk, buchstaben, nummer };
}
