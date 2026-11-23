export interface CountryHolidayEntry {
  dateYmd: string; // YYYY-MM-DD
  name: string;
}

export interface BusinessDayResolution {
  dateYmd: string;
  targetMonthKey: string; // YYYY-MM month in which the business day was resolved
  requestedBusinessDay: number;
  effectiveBusinessDay: number;
  country: string;
  skippedHolidays: CountryHolidayEntry[];
}

/**
 * Returns the following month in YYYY-MM format (e.g. '2026-11' -> '2026-12', '2026-12' -> '2027-01').
 */
export const getNextMonthPeriodKey = (periodKey: string): string => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodKey || '').trim());
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const monthIdx = match ? Number(match[2]) - 1 : now.getMonth();
  const next = new Date(year, monthIdx + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
};

export const DEFAULT_ACTIVITY_COUNTRY = 'Colombia';

export const COUNTRY_HOLIDAY_OPTIONS: string[] = [
  'Colombia',
  'Guatemala',
  'El Salvador',
  'Honduras',
  'Nicaragua',
  'Costa Rica',
  'Panamá',
  'México',
  'Ecuador',
  'Perú',
  'Chile',
  'República Dominicana',
  'Estados Unidos',
  'Brasil',
  'España',
  'Otro / Sin feriados',
];

const COUNTRY_ALIASES: Record<string, string> = {
  colombia: 'Colombia',
  co: 'Colombia',
  col: 'Colombia',
  guatemala: 'Guatemala',
  gt: 'Guatemala',
  gtm: 'Guatemala',
  'el salvador': 'El Salvador',
  sv: 'El Salvador',
  slv: 'El Salvador',
  honduras: 'Honduras',
  hn: 'Honduras',
  hnd: 'Honduras',
  nicaragua: 'Nicaragua',
  ni: 'Nicaragua',
  nic: 'Nicaragua',
  'costa rica': 'Costa Rica',
  cr: 'Costa Rica',
  cri: 'Costa Rica',
  panama: 'Panamá',
  'panamá': 'Panamá',
  pa: 'Panamá',
  pan: 'Panamá',
  mexico: 'México',
  'méxico': 'México',
  mx: 'México',
  mex: 'México',
  ecuador: 'Ecuador',
  ec: 'Ecuador',
  ecu: 'Ecuador',
  peru: 'Perú',
  'perú': 'Perú',
  pe: 'Perú',
  per: 'Perú',
  chile: 'Chile',
  cl: 'Chile',
  chl: 'Chile',
  'republica dominicana': 'República Dominicana',
  'república dominicana': 'República Dominicana',
  do: 'República Dominicana',
  dom: 'República Dominicana',
  'estados unidos': 'Estados Unidos',
  usa: 'Estados Unidos',
  us: 'Estados Unidos',
  'ee.uu.': 'Estados Unidos',
  eeuu: 'Estados Unidos',
  'united states': 'Estados Unidos',
  brasil: 'Brasil',
  brazil: 'Brasil',
  br: 'Brasil',
  bra: 'Brasil',
  espana: 'España',
  'españa': 'España',
  es: 'España',
  esp: 'España',
  'otro / sin feriados': 'Otro / Sin feriados',
  global: 'Otro / Sin feriados',
};

export const normalizeActivityCountry = (rawCountry?: string | null): string => {
  const clean = String(rawCountry || '').trim();
  if (!clean) return DEFAULT_ACTIVITY_COUNTRY;
  const lowered = clean.toLowerCase();
  if (COUNTRY_ALIASES[lowered]) return COUNTRY_ALIASES[lowered];
  const exact = COUNTRY_HOLIDAY_OPTIONS.find((c) => c.toLowerCase() === lowered);
  return exact || clean;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

const toYmd = (year: number, month: number, day: number): string =>
  `${year}-${pad2(month)}-${pad2(day)}`;

const addDays = (year: number, month: number, day: number, offsetDays: number): Date =>
  new Date(year, month - 1, day + offsetDays, 12, 0, 0);

const dateToYmd = (d: Date): string =>
  toYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());

/**
 * Computes Gregorian Easter Sunday (Meeus/Jones/Butcher algorithm) for any year.
 */
const getEasterSunday = (year: number): Date => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12, 0, 0);
};

const addDaysFromDate = (base: Date, offsetDays: number): Date =>
  new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays, 12, 0, 0);

/**
 * Colombia Ley 51 de 1983 (Ley Emiliani): shifts the holiday to the next Monday if not already Monday.
 */
const emilianiMonday = (d: Date): Date => {
  const dow = d.getDay(); // 0=Sun, 1=Mon, ...
  if (dow === 1) return d;
  const daysUntilMon = dow === 0 ? 1 : 8 - dow;
  return addDaysFromDate(d, daysUntilMon);
};

/**
 * Finds the N-th occurrence (1-indexed) of targetDow (0=Sun..6=Sat) in a given month (1..12).
 */
const nthWeekdayOfMonth = (
  year: number,
  month: number,
  targetDow: number,
  nth: number
): Date => {
  const firstDow = new Date(year, month - 1, 1, 12, 0, 0).getDay();
  const offset = (targetDow - firstDow + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  return new Date(year, month - 1, day, 12, 0, 0);
};

/**
 * Finds the last occurrence of targetDow (0=Sun..6=Sat) in a given month (1..12).
 */
const lastWeekdayOfMonth = (year: number, month: number, targetDow: number): Date => {
  const lastDay = new Date(year, month, 0, 12, 0, 0);
  const dow = lastDay.getDay();
  const back = (dow - targetDow + 7) % 7;
  return addDaysFromDate(lastDay, -back);
};

/**
 * US Federal observed date rule: Sat -> Fri, Sun -> Mon.
 */
const usObserved = (year: number, month: number, day: number): Date => {
  const d = new Date(year, month - 1, day, 12, 0, 0);
  const dow = d.getDay();
  if (dow === 6) return addDaysFromDate(d, -1);
  if (dow === 0) return addDaysFromDate(d, 1);
  return d;
};

/**
 * Ecuador Ley Orgánica de Feriados bridging rule:
 * Tue -> Mon, Wed/Thu -> Fri, Sat -> Fri, Sun -> Mon (except Jan 1 / Dec 25 / Carnival / Good Friday).
 */
const ecuadorBridged = (year: number, month: number, day: number): Date => {
  const d = new Date(year, month - 1, day, 12, 0, 0);
  const dow = d.getDay();
  if (dow === 2) return addDaysFromDate(d, -1);
  if (dow === 3) return addDaysFromDate(d, 2);
  if (dow === 4) return addDaysFromDate(d, 1);
  if (dow === 6) return addDaysFromDate(d, -1);
  if (dow === 0) return addDaysFromDate(d, 1);
  return d;
};

const addEntry = (
  map: Map<string, string>,
  date: Date | string,
  name: string
) => {
  const ymd = typeof date === 'string' ? date : dateToYmd(date);
  const existing = map.get(ymd);
  map.set(ymd, existing && !existing.includes(name) ? `${existing} / ${name}` : name);
};

/**
 * Returns a Map<YYYY-MM-DD, HolidayName> of official national holidays for the given country & year.
 */
export const getCountryHolidaysMapForYear = (
  rawCountry: string | undefined | null,
  year: number
): Map<string, string> => {
  const country = normalizeActivityCountry(rawCountry);
  const map = new Map<string, string>();
  if (country === 'Otro / Sin feriados') return map;

  const easter = getEasterSunday(year);
  const maundyThursday = addDaysFromDate(easter, -3);
  const goodFriday = addDaysFromDate(easter, -2);
  const holySaturday = addDaysFromDate(easter, -1);
  const carnivalMonday = addDaysFromDate(easter, -48);
  const carnivalTuesday = addDaysFromDate(easter, -47);
  const corpusChristiThu = addDaysFromDate(easter, 60);

  switch (country) {
    case 'Colombia': {
      // Fixed holidays
      addEntry(map, toYmd(year, 1, 1), 'Año Nuevo');
      addEntry(map, toYmd(year, 5, 1), 'Día del Trabajo');
      addEntry(map, toYmd(year, 7, 20), 'Día de la Independencia');
      addEntry(map, toYmd(year, 8, 7), 'Batalla de Boyacá');
      addEntry(map, toYmd(year, 12, 8), 'Inmaculada Concepción');
      addEntry(map, toYmd(year, 12, 25), 'Navidad');

      // Holy Week (Thursday & Friday)
      addEntry(map, maundyThursday, 'Jueves Santo');
      addEntry(map, goodFriday, 'Viernes Santo');

      // Ley Emiliani (shifted to following Monday)
      addEntry(map, emilianiMonday(addDays(year, 1, 6, 0)), 'Día de los Reyes Magos');
      addEntry(map, emilianiMonday(addDays(year, 3, 19, 0)), 'Día de San José');
      addEntry(map, emilianiMonday(addDaysFromDate(easter, 39)), 'Ascensión del Señor');
      addEntry(map, emilianiMonday(corpusChristiThu), 'Corpus Christi');
      addEntry(map, emilianiMonday(addDaysFromDate(easter, 68)), 'Sagrado Corazón de Jesús');
      addEntry(map, emilianiMonday(addDays(year, 6, 29, 0)), 'San Pedro y San Pablo');
      addEntry(map, emilianiMonday(addDays(year, 8, 15, 0)), 'Asunción de la Virgen');
      addEntry(map, emilianiMonday(addDays(year, 10, 12, 0)), 'Día de la Raza');
      addEntry(map, emilianiMonday(addDays(year, 11, 1, 0)), 'Todos los Santos');
      addEntry(map, emilianiMonday(addDays(year, 11, 11, 0)), 'Independencia de Cartagena');
      break;
    }

    case 'Guatemala': {
      addEntry(map, toYmd(year, 1, 1), 'Año Nuevo');
      addEntry(map, maundyThursday, 'Jueves Santo');
      addEntry(map, goodFriday, 'Viernes Santo');
      addEntry(map, holySaturday, 'Sábado Santo');
      addEntry(map, toYmd(year, 5, 1), 'Día del Trabajo');
      addEntry(map, toYmd(year, 6, 30), 'Día del Ejército');
      addEntry(map, toYmd(year, 9, 15), 'Día de la Independencia');
      addEntry(map, toYmd(year, 10, 20), 'Día de la Revolución');
      addEntry(map, toYmd(year, 11, 1), 'Día de Todos los Santos');
      addEntry(map, toYmd(year, 12, 25), 'Navidad');
      break;
    }

    case 'El Salvador': {
      addEntry(map, toYmd(year, 1, 1), 'Año Nuevo');
      addEntry(map, maundyThursday, 'Jueves Santo');
      addEntry(map, goodFriday, 'Viernes Santo');
      addEntry(map, holySaturday, 'Sábado Santo');
      addEntry(map, toYmd(year, 5, 1), 'Día del Trabajo');
      addEntry(map, toYmd(year, 5, 10), 'Día de la Madre');
      addEntry(map, toYmd(year, 6, 17), 'Día del Padre');
      addEntry(map, toYmd(year, 8, 6), 'Divino Salvador del Mundo');
      addEntry(map, toYmd(year, 9, 15), 'Día de la Independencia');
      addEntry(map, toYmd(year, 11, 2), 'Día de los Difuntos');
      addEntry(map, toYmd(year, 12, 25), 'Navidad');
      break;
    }

    case 'Honduras': {
      addEntry(map, toYmd(year, 1, 1), 'Año Nuevo');
      addEntry(map, maundyThursday, 'Jueves Santo');
      addEntry(map, goodFriday, 'Viernes Santo');
      addEntry(map, holySaturday, 'Sábado Santo');
      addEntry(map, toYmd(year, 4, 14), 'Día de las Américas');
      addEntry(map, toYmd(year, 5, 1), 'Día del Trabajo');
      addEntry(map, toYmd(year, 9, 15), 'Día de la Independencia');
      // Semana Morazánica (miércoles, jueves y viernes de la primera semana completa de octubre)
      const firstWedOct = nthWeekdayOfMonth(year, 10, 3, 1);
      addEntry(map, firstWedOct, 'Feriado Morazánico (Día del Soldado)');
      addEntry(map, addDaysFromDate(firstWedOct, 1), 'Feriado Morazánico (Día de la Raza)');
      addEntry(map, addDaysFromDate(firstWedOct, 2), 'Feriado Morazánico (Fuerzas Armadas)');
      addEntry(map, toYmd(year, 12, 25), 'Navidad');
      break;
    }

    case 'Nicaragua': {
      addEntry(map, toYmd(year, 1, 1), 'Año Nuevo');
      addEntry(map, maundyThursday, 'Jueves Santo');
      addEntry(map, goodFriday, 'Viernes Santo');
      addEntry(map, toYmd(year, 5, 1), 'Día del Trabajo');
      addEntry(map, toYmd(year, 7, 19), 'Día de la Revolución');
      addEntry(map, toYmd(year, 9, 14), 'Batalla de San Jacinto');
      addEntry(map, toYmd(year, 9, 15), 'Día de la Independencia');
      addEntry(map, toYmd(year, 12, 8), 'Inmaculada Concepción');
      addEntry(map, toYmd(year, 12, 25), 'Navidad');
      break;
    }

    case 'Costa Rica': {
      addEntry(map, toYmd(year, 1, 1), 'Año Nuevo');
      addEntry(map, toYmd(year, 4, 11), 'Día de Juan Santamaría');
      addEntry(map, maundyThursday, 'Jueves Santo');
      addEntry(map, goodFriday, 'Viernes Santo');
      addEntry(map, toYmd(year, 5, 1), 'Día del Trabajo');
      addEntry(map, toYmd(year, 7, 25), 'Anexión de Guanacaste');
      addEntry(map, toYmd(year, 8, 2), 'Virgen de los Ángeles');
      addEntry(map, toYmd(year, 8, 15), 'Día de la Madre');
      addEntry(map, toYmd(year, 9, 15), 'Día de la Independencia');
      addEntry(map, toYmd(year, 12, 1), 'Abolición del Ejército');
      addEntry(map, toYmd(year, 12, 25), 'Navidad');
      break;
    }

    case 'Panamá': {
      addEntry(map, toYmd(year, 1, 1), 'Año Nuevo');
      addEntry(map, toYmd(year, 1, 9), 'Día de los Mártires');
      addEntry(map, carnivalTuesday, 'Martes de Carnaval');
      addEntry(map, goodFriday, 'Viernes Santo');
      addEntry(map, toYmd(year, 5, 1), 'Día del Trabajo');
      addEntry(map, toYmd(year, 11, 3), 'Separación de Panamá de Colombia');
      addEntry(map, toYmd(year, 11, 4), 'Día de los Símbolos Patrios');
      addEntry(map, toYmd(year, 11, 5), 'Consolidación en Colón');
      addEntry(map, toYmd(year, 11, 10), 'Grito de Independencia (La Villa)');
      addEntry(map, toYmd(year, 11, 28), 'Independencia de Panamá de España');
      addEntry(map, toYmd(year, 12, 8), 'Día de las Madres');
      addEntry(map, toYmd(year, 12, 25), 'Navidad');
      break;
    }

    case 'México': {
      addEntry(map, toYmd(year, 1, 1), 'Año Nuevo');
      addEntry(map, nthWeekdayOfMonth(year, 2, 1, 1), 'Día de la Constitución');
      addEntry(map, nthWeekdayOfMonth(year, 3, 1, 3), 'Natalicio de Benito Juárez');
      addEntry(map, toYmd(year, 5, 1), 'Día del Trabajo');
      addEntry(map, toYmd(year, 9, 16), 'Día de la Independencia');
      if (year >= 2024 && (year - 2024) % 6 === 0) {
        addEntry(map, toYmd(year, 10, 1), 'Transmisión del Poder Ejecutivo Federal');
      }
      addEntry(map, nthWeekdayOfMonth(year, 11, 1, 3), 'Revolución Mexicana');
      addEntry(map, toYmd(year, 12, 25), 'Navidad');
      break;
    }

    case 'Ecuador': {
      addEntry(map, toYmd(year, 1, 1), 'Año Nuevo');
      addEntry(map, carnivalMonday, 'Lunes de Carnaval');
      addEntry(map, carnivalTuesday, 'Martes de Carnaval');
      addEntry(map, goodFriday, 'Viernes Santo');
      addEntry(map, ecuadorBridged(year, 5, 1), 'Día del Trabajo');
      addEntry(map, ecuadorBridged(year, 5, 24), 'Batalla de Pichincha');
      addEntry(map, ecuadorBridged(year, 8, 10), 'Primer Grito de Independencia');
      addEntry(map, ecuadorBridged(year, 10, 9), 'Independencia de Guayaquil');
      addEntry(map, ecuadorBridged(year, 11, 2), 'Día de los Difuntos');
      addEntry(map, ecuadorBridged(year, 11, 3), 'Independencia de Cuenca');
      addEntry(map, toYmd(year, 12, 25), 'Navidad');
      break;
    }

    case 'Perú': {
      addEntry(map, toYmd(year, 1, 1), 'Año Nuevo');
      addEntry(map, maundyThursday, 'Jueves Santo');
      addEntry(map, goodFriday, 'Viernes Santo');
      addEntry(map, toYmd(year, 5, 1), 'Día del Trabajo');
      addEntry(map, toYmd(year, 6, 7), 'Batalla de Arica y Día de la Bandera');
      addEntry(map, toYmd(year, 6, 29), 'San Pedro y San Pablo');
      addEntry(map, toYmd(year, 7, 23), 'Día de la Fuerza Aérea del Perú');
      addEntry(map, toYmd(year, 7, 28), 'Fiestas Patrias');
      addEntry(map, toYmd(year, 7, 29), 'Fiestas Patrias');
      addEntry(map, toYmd(year, 8, 6), 'Batalla de Junín');
      addEntry(map, toYmd(year, 8, 30), 'Santa Rosa de Lima');
      addEntry(map, toYmd(year, 10, 8), 'Combate de Angamos');
      addEntry(map, toYmd(year, 11, 1), 'Todos los Santos');
      addEntry(map, toYmd(year, 12, 8), 'Inmaculada Concepción');
      addEntry(map, toYmd(year, 12, 9), 'Batalla de Ayacucho');
      addEntry(map, toYmd(year, 12, 25), 'Navidad');
      break;
    }

    case 'Chile': {
      addEntry(map, toYmd(year, 1, 1), 'Año Nuevo');
      addEntry(map, goodFriday, 'Viernes Santo');
      addEntry(map, holySaturday, 'Sábado Santo');
      addEntry(map, toYmd(year, 5, 1), 'Día del Trabajo');
      addEntry(map, toYmd(year, 5, 21), 'Día de las Glorias Navales');
      addEntry(map, toYmd(year, 6, 29), 'San Pedro y San Pablo');
      addEntry(map, toYmd(year, 7, 16), 'Día de la Virgen del Carmen');
      addEntry(map, toYmd(year, 8, 15), 'Asunción de la Virgen');
      addEntry(map, toYmd(year, 9, 18), 'Independencia Nacional');
      addEntry(map, toYmd(year, 9, 19), 'Día de las Glorias del Ejército');
      addEntry(map, toYmd(year, 10, 12), 'Encuentro de Dos Mundos');
      addEntry(map, toYmd(year, 10, 31), 'Día de las Iglesias Evangélicas');
      addEntry(map, toYmd(year, 11, 1), 'Día de Todos los Santos');
      addEntry(map, toYmd(year, 12, 8), 'Inmaculada Concepción');
      addEntry(map, toYmd(year, 12, 25), 'Navidad');
      break;
    }

    case 'República Dominicana': {
      addEntry(map, toYmd(year, 1, 1), 'Año Nuevo');
      addEntry(map, toYmd(year, 1, 6), 'Día de los Reyes Magos');
      addEntry(map, toYmd(year, 1, 21), 'Día de la Altagracia');
      addEntry(map, toYmd(year, 1, 26), 'Día de Duarte');
      addEntry(map, toYmd(year, 2, 27), 'Independencia Nacional');
      addEntry(map, goodFriday, 'Viernes Santo');
      addEntry(map, toYmd(year, 5, 1), 'Día del Trabajo');
      addEntry(map, corpusChristiThu, 'Corpus Christi');
      addEntry(map, toYmd(year, 8, 16), 'Día de la Restauración');
      addEntry(map, toYmd(year, 9, 24), 'Día de las Mercedes');
      addEntry(map, toYmd(year, 11, 6), 'Día de la Constitución');
      addEntry(map, toYmd(year, 12, 25), 'Navidad');
      break;
    }

    case 'Estados Unidos': {
      addEntry(map, usObserved(year, 1, 1), "New Year's Day");
      addEntry(map, nthWeekdayOfMonth(year, 1, 1, 3), 'Martin Luther King Jr. Day');
      addEntry(map, nthWeekdayOfMonth(year, 2, 1, 3), "Presidents' Day");
      addEntry(map, lastWeekdayOfMonth(year, 5, 1), 'Memorial Day');
      addEntry(map, usObserved(year, 6, 19), 'Juneteenth');
      addEntry(map, usObserved(year, 7, 4), 'Independence Day');
      addEntry(map, nthWeekdayOfMonth(year, 9, 1, 1), 'Labor Day');
      addEntry(map, nthWeekdayOfMonth(year, 10, 1, 2), 'Columbus Day');
      addEntry(map, usObserved(year, 11, 11), 'Veterans Day');
      addEntry(map, nthWeekdayOfMonth(year, 11, 4, 4), 'Thanksgiving Day');
      addEntry(map, usObserved(year, 12, 25), 'Christmas Day');
      break;
    }

    case 'Brasil': {
      addEntry(map, toYmd(year, 1, 1), 'Confraternização Universal');
      addEntry(map, carnivalMonday, 'Carnaval');
      addEntry(map, carnivalTuesday, 'Carnaval');
      addEntry(map, goodFriday, 'Sexta-feira Santa');
      addEntry(map, toYmd(year, 4, 21), 'Tiradentes');
      addEntry(map, toYmd(year, 5, 1), 'Dia do Trabalho');
      addEntry(map, corpusChristiThu, 'Corpus Christi');
      addEntry(map, toYmd(year, 9, 7), 'Independência do Brasil');
      addEntry(map, toYmd(year, 10, 12), 'Nossa Senhora Aparecida');
      addEntry(map, toYmd(year, 11, 2), 'Finados');
      addEntry(map, toYmd(year, 11, 15), 'Proclamação da República');
      addEntry(map, toYmd(year, 11, 20), 'Dia da Consciência Negra');
      addEntry(map, toYmd(year, 12, 25), 'Natal');
      break;
    }

    case 'España': {
      addEntry(map, toYmd(year, 1, 1), 'Año Nuevo');
      addEntry(map, toYmd(year, 1, 6), 'Epifanía del Señor');
      addEntry(map, goodFriday, 'Viernes Santo');
      addEntry(map, toYmd(year, 5, 1), 'Fiesta del Trabajo');
      addEntry(map, toYmd(year, 8, 15), 'Asunción de la Virgen');
      addEntry(map, toYmd(year, 10, 12), 'Fiesta Nacional de España');
      addEntry(map, toYmd(year, 11, 1), 'Todos los Santos');
      addEntry(map, toYmd(year, 12, 6), 'Día de la Constitución');
      addEntry(map, toYmd(year, 12, 8), 'Inmaculada Concepción');
      addEntry(map, toYmd(year, 12, 25), 'Navidad');
      break;
    }

    default:
      break;
  }

  return map;
};

/**
 * Lists all official holidays for a given YYYY-MM period and country, sorted chronologically.
 */
export const getCountryHolidaysForPeriod = (
  periodKey: string,
  rawCountry?: string | null
): CountryHolidayEntry[] => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodKey || '').trim());
  if (!match) return [];
  const year = Number(match[1]);
  const monthPrefix = `${match[1]}-${match[2]}-`;
  const yearMap = getCountryHolidaysMapForYear(rawCountry, year);

  const entries: CountryHolidayEntry[] = [];
  yearMap.forEach((name, dateYmd) => {
    if (dateYmd.startsWith(monthPrefix)) {
      entries.push({ dateYmd, name });
    }
  });
  return entries.sort((a, b) => a.dateYmd.localeCompare(b.dateYmd));
};

/**
 * Resolves the N-th business day (`día hábil N`) within a YYYY-MM period for a company's country.
 *
 * RULE:
 * - Saturdays, Sundays, and official national holidays of that country are NON-working days and are excluded.
 * - If N exceeds total business days in that month, clamps to the last business day of the month.
 */
export const resolveBusinessDayDateForPeriod = (
  periodKey: string,
  businessDayNumber: number,
  rawCountry?: string | null
): BusinessDayResolution => {
  const country = normalizeActivityCountry(rawCountry);
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodKey || '').trim());
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) : now.getMonth() + 1;

  const targetMonthKey = toYmd(year, month, 1).slice(0, 7);
  const daysInMonth = new Date(year, month, 0).getDate();
  const requestedBusinessDay = Math.min(31, Math.max(1, Math.round(businessDayNumber || 10)));
  const holidaysMap = getCountryHolidaysMapForYear(country, year);

  const skippedHolidays: CountryHolidayEntry[] = [];
  let businessCount = 0;
  let lastBusinessYmd = toYmd(year, month, daysInMonth);

  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month - 1, day, 12, 0, 0).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const ymd = toYmd(year, month, day);
    const holidayName = holidaysMap.get(ymd);
    if (holidayName) {
      skippedHolidays.push({ dateYmd: ymd, name: holidayName });
    }
    if (isWeekend || holidayName) {
      continue;
    }

    businessCount++;
    lastBusinessYmd = ymd;
    if (businessCount === requestedBusinessDay) {
      return {
        dateYmd: ymd,
        targetMonthKey,
        requestedBusinessDay,
        effectiveBusinessDay: businessCount,
        country,
        skippedHolidays,
      };
    }
  }

  return {
    dateYmd: lastBusinessYmd,
    targetMonthKey,
    requestedBusinessDay,
    effectiveBusinessDay: Math.max(1, businessCount),
    country,
    skippedHolidays,
  };
};
